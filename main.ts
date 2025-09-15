import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { GeminiService } from "./src/services/GeminiService";
import { LanguageSelectionModal } from "./src/modals/LanguageSelectionModal";
import { MarkdownRenderer } from "obsidian";
import { FileSelectionModal } from "./src/modals/FileSelectionModal";

// Core interfaces for chat functionality
interface ChatMessage {
	role: "user" | "bot";
	content: string;
	timestamp: number;
}

interface ChatSession {
	id: string;
	title: string;
	timestamp: number;
	messages: ChatMessage[];
}

interface GeminiChatbotSettings {
	apiKey: string;
	floatingPosition: { x: number; y: number };
	isDocked: boolean;
	chatSessions: ChatSession[];
}

// Default plugin settings
const DEFAULT_SETTINGS: GeminiChatbotSettings = {
	apiKey: "",
	floatingPosition: { x: 20, y: 20 },
	isDocked: false,
	chatSessions: [],
};

export default class GeminiChatbotPlugin extends Plugin {
	// Core plugin properties
	settings: GeminiChatbotSettings;
	chatIcon: HTMLElement;
	chatContainer: HTMLElement;
	private geminiService: GeminiService | null = null;
	private messagesContainer: HTMLElement | null = null;
	private inputField: HTMLTextAreaElement | null = null;
	private currentFileContent: string | null = null;
	private chatHistory: ChatMessage[] = [];
	private isFullPage = false;
	private currentSession: ChatSession | null = null;
	private referencedFiles: Map<string, string> | null = null;

	// Rate limiting and context management
	private lastApiCall = 0;
	private readonly API_COOLDOWN = 1000; // Prevent rapid-fire API calls
	private readonly MAX_CONTEXT_LENGTH = 30000; // Prevent token limit issues

	async onload() {
		await this.loadSettings();
		if (this.settings.apiKey) {
			this.initializeGeminiService();
		}

		// Add settings tab
		this.addSettingTab(new GeminiChatbotSettingTab(this.app, this));

		// Add floating chat icon
		this.addFloatingIcon();

		// Add chat container
		this.addChatContainer();

		// Add workspace event listener for active file changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", async () => {
				if (
					this.chatContainer &&
					!this.chatContainer.hasClass("initially-hidden") &&
					!this.chatContainer.hasClass("gemini-hidden")
				) {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						this.currentFileContent = await this.app.vault.read(
							activeFile
						);
						this.updateChatHeader();
					} else {
						this.currentFileContent = null;
						this.updateChatHeader();
					}
				}
			})
		);
	}

	public initializeGeminiService() {
		try {
			if (this.settings.apiKey) {
				const decryptedKey = this.decryptApiKey(this.settings.apiKey);
				this.geminiService = new GeminiService(decryptedKey);
			}
		} catch (error) {
			console.error("Failed to initialize Gemini service:", error);
		}
	}

	private async handleMessage(message: string) {
		if (!this.geminiService || !message.trim()) return;

		// Check API cooldown
		const now = Date.now();
		if (now - this.lastApiCall < this.API_COOLDOWN) {
			this.addErrorMessage(
				"Please wait a moment before sending another message"
			);
			return;
		}

		this.toggleSuggestedActions(false);

		// Build context more efficiently
		let contextMessage = message;
		let context = "";

		// Add referenced file content if any
		const fileReferences = message.match(/@([^\s]+)/g);
		if (fileReferences) {
			contextMessage = message.replace(/@([^\s]+)/g, "").trim();
			for (const ref of fileReferences) {
				const fileName = ref.slice(1);
				const fileContent = this.referencedFiles?.get(fileName);
				if (fileContent) {
					// Add only the first part of long files
					const truncatedContent = this.truncateContent(fileContent);
					context += `\nRelevant content from ${fileName}:\n${truncatedContent}\n`;
				}
			}
		}

		// Add current file content if available and no specific file was referenced
		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile && !fileReferences) {
			const content = await this.app.vault.read(activeFile);
			// Add only relevant parts of the current file
			const truncatedContent = this.truncateContent(content);
			context += `\nRelevant content from current note:\n${truncatedContent}\n`;
		}

		// Prepare the final message
		const finalMessage = context
			? `${context}\n\nUser question: ${contextMessage}`
			: contextMessage;

		const userMessage: ChatMessage = {
			role: "user",
			content: finalMessage,
			timestamp: Date.now(),
		};

		await this.addMessageToChat({
			...userMessage,
			content: contextMessage,
		});

		// Add typing indicator
		const typingIndicator = document.createElement("div");
		typingIndicator.addClass("typing-indicator");

		// Create spans using DOM API
		for (let i = 0; i < 3; i++) {
			const span = document.createElement("span");
			typingIndicator.appendChild(span);
		}
		this.messagesContainer?.appendChild(typingIndicator);

		try {
			this.lastApiCall = Date.now();
			const response = await this.geminiService.sendMessage(finalMessage);
			typingIndicator.remove();

			const botMessage: ChatMessage = {
				role: "bot",
				content: response,
				timestamp: Date.now(),
			};

			await this.addMessageToChat(botMessage);

			// Update chat session
			if (this.currentSession) {
				if (this.currentSession.messages.length === 2) {
					this.currentSession.title = this.generateSessionTitle(
						userMessage.content
					);
				}
				this.settings.chatSessions = [
					this.currentSession,
					...this.settings.chatSessions.filter(
						(s) => s.id !== this.currentSession?.id
					),
				];
				await this.saveSettings();
			}
		} catch (error) {
			typingIndicator.remove();

			let errorMessage = "Failed to get response from Gemini";

			if (error instanceof Error) {
				// Handle safety-related errors
				if (error.message.includes("SAFETY")) {
					errorMessage =
						"I cannot provide a response to that as it may violate content safety guidelines.";
				}
				// Handle blocked content
				else if (
					error.message.includes("blocked") ||
					error.message.includes("OTHER")
				) {
					errorMessage =
						"I cannot process that request as it was blocked by content filters.";
				}
				// Handle rate limits
				else if (
					error.message.includes("429") ||
					error.message.includes("quota")
				) {
					errorMessage =
						"API rate limit reached. Please wait a moment before trying again.";
				}
				// Handle invalid requests
				else if (error.message.includes("400")) {
					errorMessage =
						"Invalid request. Please try rephrasing your message.";
				}
				// Handle authentication errors
				else if (
					error.message.includes("401") ||
					error.message.includes("403")
				) {
					errorMessage =
						"API authentication failed. Please check your API key in settings.";
				}
				// Handle server errors
				else if (error.message.includes("500")) {
					errorMessage =
						"Gemini service is currently experiencing issues. Please try again later.";
				}
				// Log the actual error for debugging
				console.error("Gemini API Error:", error);
			}

			this.addErrorMessage(errorMessage);
		}
	}

	private async addMessageToChat(message: ChatMessage) {
		if (!this.messagesContainer) return;

		// Hide bot info and suggested actions after first message
		if (this.currentSession?.messages.length === 0) {
			const botInfo = this.chatContainer?.querySelector(".bot-info");
			const suggestedActions = this.chatContainer?.querySelector(
				".vaultai-suggested-actions"
			);

			botInfo?.addClass("hidden");
			suggestedActions?.addClass("hidden");

			// Remove elements after animation
			setTimeout(() => {
				botInfo?.remove();
				suggestedActions?.remove();
			}, 300);
		}

		const messageEl = document.createElement("div");
		messageEl.addClass(`gemini-message-${message.role}`);

		if (message.role === "bot") {
			// Add copy button
			const copyButton = messageEl.createEl("button", {
				text: "Copy to new note",
				cls: "copy-response-button",
			});

			copyButton.addEventListener("click", async () => {
				// Generate creative title based on content
				const title = this.generateNoteTitle(message.content);
				const file = await this.app.vault.create(
					`${title}.md`,
					message.content
				);
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);
				new Notice("Response copied to new note!");
			});

			// Directly render markdown using the correct API
			await MarkdownRenderer.render(this.app, message.content, messageEl, "", this);
		} else {
			// For user messages, just show the visible part
			const visibleContent = this.stripContextFromMessage(
				message.content
			);
			messageEl.textContent = visibleContent;
		}

		this.messagesContainer.appendChild(messageEl);
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

		if (this.currentSession) {
			this.currentSession.messages.push(message);
		}
	}

	// Add new method for typing animation
	private async typeMessage(text: string, container: HTMLElement) {
		// First render the markdown but keep it hidden
		await MarkdownRenderer.render(this.app, text, container, "", this);
		const elements = Array.from(container.children);
		container.empty();

		for (const element of elements) {
			if (element instanceof HTMLElement) {
				if (element.tagName === "P") {
					// For paragraphs, type each character
					const text = element.textContent || "";
					const p = container.createEl("p");
					for (const char of text) {
						p.textContent += char;
						await new Promise((resolve) => setTimeout(resolve, 10)); // Adjust speed here
						if (this.messagesContainer) {
							this.messagesContainer.scrollTop =
								this.messagesContainer.scrollHeight;
						}
					}
				} else {
					// For other elements (code blocks, lists, etc.), add them instantly
					container.appendChild(element);
				}
			}
		}
	}

	// Add method to strip context from messages
	private stripContextFromMessage(message: string): string {
		// Remove the context part from the message
		const userQuestionMatch = message.match(/User question: (.*?)$/m);
		if (userQuestionMatch) {
			return userQuestionMatch[1].trim();
		}
		return message;
	}

	private addErrorMessage(message: string) {
		const errorDiv = createEl("div", { cls: "gemini-message-error" });

		const iconDiv = createEl("div", {
			cls: "error-icon",
			text: "⚠️",
		});

		const contentDiv = createEl("div", {
			cls: "error-content",
			text: message,
		});

		errorDiv.appendChild(iconDiv);
		errorDiv.appendChild(contentDiv);

		this.messagesContainer?.appendChild(errorDiv);
		if (this.messagesContainer) {
			this.messagesContainer.scrollTop =
				this.messagesContainer.scrollHeight;
		}
	}

	private addFloatingIcon() {
		this.chatIcon = createEl("div", { cls: "gemini-chat-icon" });

		const svg = createSvg("svg", {
			attr: {
				width: "24",
				height: "24",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2",
			},
		});

		const path = createSvg("path", {
			attr: {
				d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
			},
		});

		svg.appendChild(path);
		this.chatIcon.appendChild(svg);

		this.chatIcon.addEventListener("click", () => {
			this.toggleChatContainer();
		});

		document.body.appendChild(this.chatIcon);
	}

	private addChatContainer() {
		this.chatContainer = document.createElement("div");
		this.chatContainer.addClass("gemini-chat-container");
		this.chatContainer.addClass("initially-hidden");
		this.chatContainer.addClass("default-size");

		// Create header
		const header = this.createChatHeader();
		this.chatContainer.appendChild(header);

		// Create bot info
		const botInfo = this.createBotInfo();
		this.chatContainer.appendChild(botInfo);

		// Create messages container
		const messagesContainer = document.createElement("div");
		messagesContainer.addClass("gemini-chat-messages");
		this.chatContainer.appendChild(messagesContainer);

		// Create suggested actions
		const suggestedActions = this.createSuggestedActions();
		this.chatContainer.appendChild(suggestedActions);

		// Create input container
		const inputContainer = this.createInputContainer();
		this.chatContainer.appendChild(inputContainer);

		document.body.appendChild(this.chatContainer);

		// Add event listeners for the buttons
		this.addChatEventListeners();

		// Add resize handle
		const resizeHandle = document.createElement("div");
		resizeHandle.addClass("resize-handle");
		this.chatContainer.appendChild(resizeHandle);

		// Add resize functionality
		this.addResizeFunctionality(resizeHandle);
	}

	private createChatHeader(): HTMLElement {
		const header = document.createElement("div");
		header.addClass("gemini-chat-header");

		// Current file indicator
		const currentFile = document.createElement("div");
		currentFile.addClass("current-file");
		header.appendChild(currentFile);

		// Header controls
		const controls = document.createElement("div");
		controls.addClass("chat-header-controls");

		// History button
		const historyButton = document.createElement("button");
		historyButton.addClass("history-button");
		const historyIcon = this.createHistoryIcon();
		historyButton.appendChild(historyIcon);
		controls.appendChild(historyButton);

		// More button
		const moreButton = document.createElement("button");
		moreButton.addClass("more-button");
		const moreIcon = this.createMoreIcon();
		moreButton.appendChild(moreIcon);
		controls.appendChild(moreButton);

		// Close button
		const closeButton = document.createElement("button");
		closeButton.addClass("close-button");
		const closeIcon = this.createCloseIcon();
		closeButton.appendChild(closeIcon);
		controls.appendChild(closeButton);

		header.appendChild(controls);
		return header;
	}

	private createHistoryIcon(): SVGElement {
		const svg = createSvg("svg", {
			attr: {
				xmlns: "http://www.w3.org/2000/svg",
				width: "20",
				height: "20",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2",
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
			},
		});

		const circle = createSvg("circle", {
			attr: {
				cx: "12",
				cy: "12",
				r: "10",
			},
		});

		const polyline = createSvg("polyline", {
			attr: {
				points: "12 6 12 12 16 14",
			},
		});

		svg.appendChild(circle);
		svg.appendChild(polyline);
		return svg;
	}

	private createMoreIcon(): SVGElement {
		const svg = createSvg("svg", {
			attr: {
				xmlns: "http://www.w3.org/2000/svg",
				width: "20",
				height: "20",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2",
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
			},
		});

		const rect = createSvg("rect", {
			attr: {
				x: "3",
				y: "3",
				width: "18",
				height: "18",
				rx: "2",
				ry: "2",
			},
		});

		const line1 = createSvg("line", {
			attr: {
				x1: "3",
				y1: "12",
				x2: "21",
				y2: "12",
			},
		});

		const line2 = createSvg("line", {
			attr: {
				x1: "12",
				y1: "3",
				x2: "12",
				y2: "21",
			},
		});

		svg.appendChild(rect);
		svg.appendChild(line1);
		svg.appendChild(line2);
		return svg;
	}

	private createCloseIcon(): SVGElement {
		const svg = createSvg("svg", {
			attr: {
				xmlns: "http://www.w3.org/2000/svg",
				width: "20",
				height: "20",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2",
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
			},
		});

		const line1 = createSvg("line", {
			attr: {
				x1: "18",
				y1: "6",
				x2: "6",
				y2: "18",
			},
		});

		const line2 = createSvg("line", {
			attr: {
				x1: "6",
				y1: "6",
				x2: "18",
				y2: "18",
			},
		});

		svg.appendChild(line1);
		svg.appendChild(line2);
		return svg;
	}

	private createBotInfo(): HTMLElement {
		const botInfo = document.createElement("div");
		botInfo.addClass("bot-info");

		// Bot avatar container
		const avatarContainer = document.createElement("div");
		avatarContainer.addClass("bot-avatar");

		// Create the avatar SVG (simplified for security)
		const avatarSvg = this.createBotAvatarSvg();
		avatarContainer.appendChild(avatarSvg);

		// Bot greeting
		const greeting = document.createElement("div");
		greeting.addClass("bot-greeting");
		greeting.textContent = "Hello, How can I help you today?";

		botInfo.appendChild(avatarContainer);
		botInfo.appendChild(greeting);
		return botInfo;
	}

	private createBotAvatarSvg(): SVGElement {
		// Create simplified avatar SVG for security
		const svg = createSvg("svg", {
			attr: {
				viewBox: "0 0 100 100",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
			},
		});

		// Simple circle avatar
		const circle = createSvg("circle", {
			attr: {
				cx: "50",
				cy: "50",
				r: "40",
				fill: "#e1e7ff",
				stroke: "#6366f1",
				"stroke-width": "3",
			},
		});

		// Simple face elements
		const leftEye = createSvg("circle", {
			attr: {
				cx: "38",
				cy: "40",
				r: "3",
				fill: "#374151",
			},
		});

		const rightEye = createSvg("circle", {
			attr: {
				cx: "62",
				cy: "40",
				r: "3",
				fill: "#374151",
			},
		});

		const mouth = createSvg("path", {
			attr: {
				d: "M 38 60 Q 50 70 62 60",
				stroke: "#374151",
				"stroke-width": "2",
				fill: "none",
				"stroke-linecap": "round",
			},
		});

		svg.appendChild(circle);
		svg.appendChild(leftEye);
		svg.appendChild(rightEye);
		svg.appendChild(mouth);
		return svg;
	}

	private createSuggestedActions(): HTMLElement {
		const suggestedActions = document.createElement("div");
		suggestedActions.addClass("vaultai-suggested-actions");

		// Title
		const title = document.createElement("h3");
		title.textContent = "Suggested";
		suggestedActions.appendChild(title);

		// Action buttons
		const actions = [
			{ icon: "📝", text: "Summarize this page" },
			{ icon: "🔍", text: "Ask about this page" },
			{ icon: "📚", text: "Make a quiz" },
			{ icon: "🌐", text: "Translate to" },
		];

		actions.forEach((action) => {
			const button = document.createElement("div");
			button.addClass("vaultai-action-button");

			const icon = document.createElement("span");
			icon.addClass("vaultai-action-icon");
			icon.textContent = action.icon;

			button.appendChild(icon);
			button.appendChild(document.createTextNode(action.text));
			suggestedActions.appendChild(button);
		});

		return suggestedActions;
	}

	private createInputContainer(): HTMLElement {
		const inputContainer = document.createElement("div");
		inputContainer.addClass("chat-input-container");

		const inputWrapper = document.createElement("div");
		inputWrapper.addClass("chat-input-wrapper");

		// Text area
		const textarea = document.createElement("textarea");
		textarea.addClass("chat-input");
		textarea.placeholder = "Ask anything or select...";

		// Actions container
		const actionsContainer = document.createElement("div");
		actionsContainer.addClass("input-actions");

		// Mention button
		const mentionButton = document.createElement("button");
		mentionButton.addClass("mention-button");
		mentionButton.textContent = "@";

		// Send button
		const sendButton = document.createElement("button");
		sendButton.addClass("send-button");
		sendButton.textContent = "↑";

		actionsContainer.appendChild(mentionButton);
		actionsContainer.appendChild(sendButton);

		inputWrapper.appendChild(textarea);
		inputWrapper.appendChild(actionsContainer);
		inputContainer.appendChild(inputWrapper);

		return inputContainer;
	}

	private addChatEventListeners() {
		const closeButton = this.chatContainer.querySelector(".close-button");
		closeButton?.addEventListener("click", () => {
			this.toggleChatContainer();
		});

		const sendButton = this.chatContainer.querySelector(".send-button");
		const inputField = this.chatContainer.querySelector(
			".chat-input"
		) as HTMLTextAreaElement;
		this.inputField = inputField;
		this.messagesContainer = this.chatContainer.querySelector(
			".gemini-chat-messages"
		);

		sendButton?.addEventListener("click", () => {
			if (this.inputField) {
				const message = this.inputField.value.trim();
				if (message) {
					this.handleMessage(message);
					this.inputField.value = "";
				}
			}
		});

		inputField?.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && this.inputField) {
				e.preventDefault();
				const message = this.inputField.value.trim();
				if (message) {
					this.handleMessage(message);
					this.inputField.value = "";
				}
			}
		});

		// Simplify action buttons handlers
		const actionButtons = this.chatContainer.querySelectorAll(
			".vaultai-action-button"
		);
		actionButtons.forEach((button) => {
			button.addEventListener("click", () => {
				if (!this.inputField) return;

				// Simply set the input value based on the action
				if (button.textContent?.includes("Summarize")) {
					this.inputField.value =
						"Can you summarize this note for me?";
				} else if (button.textContent?.includes("Ask about")) {
					this.inputField.value = "What is this note about?";
				} else if (button.textContent?.includes("Make a quiz")) {
					this.inputField.value =
						"Can you create a quiz using this note?";
				} else if (button.textContent?.includes("Translate")) {
					new LanguageSelectionModal(this.app, (language: string) => {
						if (this.inputField) {
							this.inputField.value = `Can you translate this note to ${language}?`;
						}
					}).open();
				}

				// Focus the input
				this.inputField.focus();
			});
		});

		// Update history button handler
		const historyButton =
			this.chatContainer.querySelector(".history-button");
		historyButton?.addEventListener("click", () => {
			// Show chat history view instead of just showing messages
			this.showChatHistoryView();
		});

		// Add more options menu
		const moreButton = this.chatContainer.querySelector(".more-button");
		moreButton?.addEventListener("click", async (event) => {
			this.showMoreOptionsMenu(event as MouseEvent);
		});

		// Add @ button handler
		const mentionButton =
			this.chatContainer.querySelector(".mention-button");
		mentionButton?.addEventListener("click", () => {
			this.showFileSelectionModal();
		});
	}

	private showLanguageSelectionModal(content: string) {
		new LanguageSelectionModal(this.app, (language: string) => {
			if (this.geminiService) {
				this.geminiService
					.translateContent(content, language)
					.then((translation) => {
						this.addMessageToChat({
							role: "bot",
							content: translation,
							timestamp: Date.now(),
						});
					})
					.catch((error) => {
						this.addErrorMessage("Translation failed");
						console.error("Translation error:", error);
					});
			}
		}).open();
	}

	private async toggleChatContainer() {
		const isVisible =
			!this.chatContainer.classList.contains("initially-hidden");

		if (isVisible) {
			// Add closing animation
			this.chatContainer.classList.add("closing");
			// Wait for animation to complete before hiding
			await new Promise((resolve) => setTimeout(resolve, 300));
			this.chatContainer.addClass("initially-hidden");
			this.chatContainer.removeClass("visible");
			this.chatContainer.classList.remove("closing");
		} else {
			// Reset the chat container content
			if (this.messagesContainer) {
				this.messagesContainer.empty();
			}

			// Recreate bot-info and suggested-actions if they don't exist
			const existingBotInfo =
				this.chatContainer.querySelector(".bot-info");
			const existingSuggestedActions = this.chatContainer.querySelector(
				".vaultai-suggested-actions"
			);

			if (!existingBotInfo) {
				const botInfo = this.createBotInfo();
				// Insert bot-info after the header
				const header = this.chatContainer.querySelector(
					".gemini-chat-header"
				);
				header?.after(botInfo);
			}

			if (!existingSuggestedActions) {
				const suggestedActions = this.createSuggestedActions();
				// Insert vaultai-suggested-actions before the chat input container
				const inputContainer = this.chatContainer.querySelector(
					".chat-input-container"
				);
				inputContainer?.before(suggestedActions);

				// Reattach event listeners for action buttons
				this.addActionButtonListeners();
			}

			this.chatContainer.removeClass("initially-hidden");
			this.chatContainer.addClass("visible");
			this.currentSession = this.createNewSession();
			this.showMainChatView();
			this.toggleSuggestedActions(true);

			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				this.currentFileContent = await this.app.vault.read(activeFile);
				this.updateChatHeader();
			} else {
				this.currentFileContent = null;
				this.updateChatHeader();
			}
		}
	}

	// Add this new method to handle action button listeners
	private addActionButtonListeners() {
		const actionButtons = this.chatContainer.querySelectorAll(
			".vaultai-action-button"
		);
		actionButtons.forEach((button) => {
			button.addEventListener("click", () => {
				if (!this.inputField) return;

				if (button.textContent?.includes("Summarize")) {
					this.inputField.value =
						"Can you summarize this note for me?";
				} else if (button.textContent?.includes("Ask about")) {
					this.inputField.value = "What is this note about?";
				} else if (button.textContent?.includes("Make a quiz")) {
					this.inputField.value =
						"Can you create a quiz using this note?";
				} else if (button.textContent?.includes("Translate")) {
					new LanguageSelectionModal(this.app, (language: string) => {
						if (this.inputField) {
							this.inputField.value = `Can you translate this note to ${language}?`;
						}
					}).open();
				}

				this.inputField.focus();
			});
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Helper methods for DOM manipulation (to handle obsidian-specific methods)
	private addClass(element: HTMLElement, className: string) {
		if (element && typeof element.addClass === 'function') {
			(element as any).addClass(className);
		} else {
			element?.classList.add(className);
		}
	}

	private removeClass(element: HTMLElement, className: string) {
		if (element && typeof element.removeClass === 'function') {
			(element as any).removeClass(className);
		} else {
			element?.classList.remove(className);
		}
	}

	private empty(element: HTMLElement) {
		if (element && typeof element.empty === 'function') {
			(element as any).empty();
		} else {
			if (element) {
				element.innerHTML = '';
			}
		}
	}

	onunload() {
		this.chatIcon?.remove();
		this.chatContainer?.remove();
	}

	public encryptApiKey(key: string): string {
		return btoa(key.split("").reverse().join(""));
	}

	public decryptApiKey(encryptedKey: string): string {
		return atob(encryptedKey).split("").reverse().join("");
	}

	// Add this method to handle showing/hiding suggested actions
	private toggleSuggestedActions(show: boolean) {
		const suggestedActions = this.chatContainer.querySelector(
			".suggested-actions"
		) as HTMLElement;
		if (suggestedActions) {
			if (show) {
				suggestedActions.removeClass("gemini-hidden");
				suggestedActions.addClass("gemini-visible");
			} else {
				suggestedActions.removeClass("gemini-visible");
				suggestedActions.addClass("gemini-hidden");
			}
		}
	}

	private updateChatHeader() {
		const activeFile = this.app.workspace.getActiveFile();
		const headerEl = this.chatContainer.querySelector(
			".current-file"
		) as HTMLElement;
		if (headerEl && activeFile) {
			headerEl.textContent = activeFile.basename;
			headerEl.removeClass("gemini-hidden");
			headerEl.addClass("gemini-visible");
		} else if (headerEl) {
			headerEl.removeClass("gemini-visible");
			headerEl.addClass("gemini-hidden");
		}
	}

	// Add method to handle more options menu
	private showMoreOptionsMenu(event: MouseEvent) {
		// Remove existing menu if present
		const existingMenu = document.querySelector('.more-options-menu');
		if (existingMenu) {
			existingMenu.remove();
			return;
		}

		// Create menu container
		const menu = document.createElement('div');
		menu.className = 'more-options-menu';

		// Position menu relative to button
		const buttonRect = (event.target as HTMLElement).getBoundingClientRect();
		menu.style.position = 'fixed';
		menu.style.top = `${buttonRect.bottom + 5}px`;
		menu.style.right = `${window.innerWidth - buttonRect.right}px`;

		// Create menu items
		const menuItems = [
			{
				icon: '↙️',
				text: 'Reset Size',
				action: () => this.resetChatSize()
			},
			{
				icon: '⛶',
				text: 'Toggle Full Screen',
				action: () => this.toggleFullPageChat()
			},
			{
				icon: '📐',
				text: 'Compact View',
				action: () => this.setCompactSize()
			},
			{
				icon: '🔄',
				text: 'New Chat',
				action: () => this.startNewChat()
			}
		];

		menuItems.forEach(item => {
			const menuItem = document.createElement('div');
			menuItem.className = 'vaultai-menu-item';
			
			const icon = document.createElement('span');
			icon.textContent = item.icon;
			
			const text = document.createElement('span');
			text.textContent = item.text;
			
			menuItem.appendChild(icon);
			menuItem.appendChild(text);
			
			menuItem.addEventListener('click', () => {
				item.action();
				menu.remove();
			});
			
			menu.appendChild(menuItem);
		});

		document.body.appendChild(menu);

		// Close menu when clicking outside
		const closeMenu = (e: MouseEvent) => {
			if (!menu.contains(e.target as Node)) {
				menu.remove();
				document.removeEventListener('click', closeMenu);
			}
		};
		
		// Delay adding the event listener to prevent immediate closure
		setTimeout(() => {
			document.addEventListener('click', closeMenu);
		}, 100);
	}

	// Add method to reset chat size
	private resetChatSize() {
		// Add resetting class for animation
		this.chatContainer.classList.add("resetting");
		this.chatContainer.classList.remove("dynamic-size");
		this.chatContainer.classList.add("default-size");

		// Clear custom size properties
		this.chatContainer.style.removeProperty("--dynamic-width");
		this.chatContainer.style.removeProperty("--dynamic-height");

		// Remove resetting class after animation
		setTimeout(() => {
			this.chatContainer.classList.remove("resetting");
		}, 400);
	}

	// Add method to set compact size
	private setCompactSize() {
		this.chatContainer.classList.remove("default-size");
		this.chatContainer.classList.add("dynamic-size");
		this.chatContainer.style.setProperty("--dynamic-width", "320px");
		this.chatContainer.style.setProperty("--dynamic-height", "480px");
	}

	// Add method to start new chat
	private startNewChat() {
		if (this.messagesContainer) {
			this.messagesContainer.empty();
		}
		this.currentSession = this.createNewSession();
		this.showMainChatView();
	}

	// Add this method to handle full page toggle
	private toggleFullPageChat() {
		this.isFullPage = !this.isFullPage;
		if (this.isFullPage) {
			this.chatContainer.addClass("full-page");
		} else {
			this.chatContainer.removeClass("full-page");
		}
	}

	// Add method to create new chat session
	private createNewSession(): ChatSession {
		return {
			id: Date.now().toString(),
			title: "New chat",
			timestamp: Date.now(),
			messages: [],
		};
	}

	// Add method to generate session title
	private generateSessionTitle(firstMessage: string): string {
		// Remove any markdown formatting
		const cleanMessage = firstMessage.replace(/[#*`]/g, "").trim();

		// Check for specific patterns in the message
		if (cleanMessage.toLowerCase().includes("summarize")) {
			return "📝 Summary: " + this.extractDocumentName(cleanMessage);
		}

		if (cleanMessage.toLowerCase().includes("translate")) {
			return "🌐 Translation: " + this.extractDocumentName(cleanMessage);
		}

		if (
			cleanMessage.toLowerCase().includes("action items") ||
			cleanMessage.toLowerCase().includes("tasks")
		) {
			return "✅ Tasks from: " + this.extractDocumentName(cleanMessage);
		}

		// For questions
		if (cleanMessage.endsWith("?")) {
			return (
				"❓ " +
				(cleanMessage.length > 40
					? cleanMessage.substring(0, 40) + "..."
					: cleanMessage)
			);
		}

		// For general chat, try to extract key topic
		const keywords = this.extractKeywords(cleanMessage);
		if (keywords) {
			return "💭 Chat about " + keywords;
		}

		// Fallback to default with timestamp
		return (
			"💬 Chat from " +
			new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			})
		);
	}

	private extractDocumentName(message: string): string {
		// Try to find the document name in the message
		const lines = message.split("\n");
		if (lines.length > 1) {
			// Take the first non-empty line after the first line
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line) {
					return line.length > 30
						? line.substring(0, 30) + "..."
						: line;
				}
			}
		}
		return "Document";
	}

	private extractKeywords(message: string): string {
		// Remove common words and get key topics
		const commonWords = new Set([
			"the",
			"be",
			"to",
			"of",
			"and",
			"a",
			"in",
			"that",
			"have",
			"i",
			"it",
			"for",
			"not",
			"on",
			"with",
			"he",
			"as",
			"you",
			"do",
			"at",
			"this",
			"but",
			"his",
			"by",
			"from",
			"they",
			"we",
			"say",
			"her",
			"she",
			"or",
			"an",
			"will",
			"my",
			"one",
			"all",
			"would",
			"there",
			"their",
			"what",
			"so",
			"up",
			"out",
			"if",
			"about",
			"who",
			"get",
			"which",
			"go",
			"me",
			"please",
			"could",
			"can",
			"just",
		]);

		// Split message into words and filter
		const words = message
			.toLowerCase()
			.replace(/[^\w\s]/g, "")
			.split(/\s+/)
			.filter((word) => !commonWords.has(word) && word.length > 2)
			.slice(0, 3);

		if (words.length > 0) {
			// Capitalize first letters
			const formattedWords = words.map(
				(word) => word.charAt(0).toUpperCase() + word.slice(1)
			);
			return formattedWords.join(", ");
		}

		return "";
	}

	// Update showChatHistoryView method
	private showChatHistoryView() {
		if (!this.chatContainer) return;

		// Hide existing elements
		const elementsToHide = [
			".bot-info",
			".vaultai-suggested-actions",
			".chat-input-container",
			".gemini-chat-messages",
		];
		elementsToHide.forEach((selector) => {
			const el = this.chatContainer.querySelector(selector);
			if (el) {
				(el as HTMLElement).removeClass("gemini-visible");
				(el as HTMLElement).removeClass("gemini-visible-flex");
				(el as HTMLElement).addClass("gemini-hidden");
			}
		});

		// Remove existing history view if any
		const existingHistoryView =
			this.chatContainer.querySelector(".chat-history-view");
		if (existingHistoryView) {
			existingHistoryView.classList.add("closing");
			setTimeout(() => existingHistoryView.remove(), 300);
			return;
		}

		// Create history view using DOM API
		const historyView = createDiv({ cls: "chat-history-view" });

		// Create header
		const header = createDiv({ cls: "chat-history-header" });

		// Back button
		const backButton = createDiv({ cls: "back-button" });
		const backIcon = createSvg("svg", {
			attr: {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
			},
		});
		const backPath = createSvg("path", {
			attr: {
				fill: "currentColor",
				d: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
			},
		});
		backIcon.appendChild(backPath);
		backButton.appendChild(backIcon);

		// Title
		const title = createEl("h2", { text: "All chats" });

		// New chat button
		const newChatButton = createDiv({
			cls: "new-chat-button",
			text: "New chat",
		});

		header.appendChild(backButton);
		header.appendChild(title);
		header.appendChild(newChatButton);

		// Search input
		const searchContainer = createDiv({ cls: "chat-history-search" });
		const searchInput = createEl("input", {
			type: "text",
			placeholder: "Search or start new chat",
		});
		searchContainer.appendChild(searchInput);

		// History sections
		const sectionsContainer = createDiv({ cls: "chat-history-sections" });
		this.renderChatHistorySections(sectionsContainer);

		// Append all elements
		historyView.appendChild(header);
		historyView.appendChild(searchContainer);
		historyView.appendChild(sectionsContainer);

		this.chatContainer.appendChild(historyView);

		// Add event listeners
		this.attachHistoryItemListeners(historyView);
	}

	// Update renderHistorySection to use DOM API
	private renderHistorySection(
		container: HTMLElement,
		title: string,
		sessions: ChatSession[]
	) {
		if (sessions.length === 0) return;

		const section = createDiv({ cls: "history-section" });
		const heading = createEl("h3", { text: title });
		section.appendChild(heading);

		sessions.forEach((session) => {
			const item = createDiv({ cls: "history-item" });
			item.setAttribute("data-session-id", session.id);

			const icon = createDiv({
				cls: "history-item-icon",
				text: "💬",
			});

			const content = createDiv({ cls: "history-item-content" });
			const itemTitle = createDiv({
				cls: "history-item-title",
				text: session.title,
			});
			const itemTime = createDiv({
				cls: "history-item-time",
				text: this.formatTime(session.timestamp),
			});

			content.appendChild(itemTitle);
			content.appendChild(itemTime);

			const deleteBtn = createDiv({ cls: "delete-chat" });
			deleteBtn.setAttribute("data-session-id", session.id);

			const deleteIcon = createSvg("svg", {
				attr: {
					width: "14",
					height: "14",
					viewBox: "0 0 24 24",
				},
			});
			const deletePath = createSvg("path", {
				attr: {
					fill: "currentColor",
					d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z",
				},
			});
			deleteIcon.appendChild(deletePath);
			deleteBtn.appendChild(deleteIcon);

			item.appendChild(icon);
			item.appendChild(content);
			item.appendChild(deleteBtn);
			section.appendChild(item);
		});

		container.appendChild(section);
	}

	// Add method to handle chat deletion
	private deleteChat(sessionId: string) {
		const historyItem = this.chatContainer.querySelector(
			`.history-item[data-session-id="${sessionId}"]`
		);
		if (historyItem) {
			historyItem.classList.add("deleting");

			// Wait for the animation to complete before removing the item
			setTimeout(() => {
				// Remove the session from settings
				this.settings.chatSessions = this.settings.chatSessions.filter(
					(s) => s.id !== sessionId
				);
				this.saveSettings();

				// Remove the item from the DOM
				historyItem.remove();

				// Re-render the chat history sections
				const sectionsContainer = this.chatContainer.querySelector(
					".chat-history-sections"
				);
				if (sectionsContainer) {
					sectionsContainer.empty();
					this.renderChatHistorySections(
						sectionsContainer as HTMLElement
					);
					this.attachHistoryItemListeners(
						sectionsContainer as HTMLElement
					);
				}
			}, 300); // Match the duration of the fadeOut animation
		}
	}

	// Add method to attach event listeners to history items
	private attachHistoryItemListeners(historyView: HTMLElement) {
		// Back button
		const backButton = historyView.querySelector(".back-button");
		backButton?.addEventListener("click", () => {
			this.goBackFromHistory();
		});

		// New chat button
		const newChatButton = historyView.querySelector(".new-chat-button");
		newChatButton?.addEventListener("click", () => {
			this.startNewChat();
			this.goBackFromHistory();
		});

		// Search functionality
		const searchInput = historyView.querySelector("input") as HTMLInputElement;
		searchInput?.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value;
			this.filterChatHistory(query);
		});

		// Delete buttons
		const deleteButtons = historyView.querySelectorAll(".delete-chat");
		deleteButtons.forEach((btn) => {
			btn.addEventListener("click", (e) => {
				e.stopPropagation(); // Prevent triggering the history item click
				const sessionId = btn.getAttribute("data-session-id");
				if (sessionId) {
					this.deleteChat(sessionId);
				}
			});
		});

		// History items
		const historyItems = historyView.querySelectorAll(".history-item");
		historyItems.forEach((item) => {
			item.addEventListener("click", () => {
				const sessionId = item.getAttribute("data-session-id");
				const session = this.settings.chatSessions.find(
					(s) => s.id === sessionId
				);
				if (session) {
					this.currentSession = { ...session };
					this.goBackFromHistory();
				}
			});
		});
	}

	// Add method to go back from history view
	private goBackFromHistory() {
		const historyView = this.chatContainer.querySelector(".chat-history-view");
		if (historyView) {
			historyView.classList.add("closing");
			setTimeout(() => {
				historyView.remove();
				this.showMainChatView();
			}, 300);
		} else {
			this.showMainChatView();
		}
	}

	// Add method to render chat history sections
	private renderChatHistorySections(container: HTMLElement): void {
		const now = Date.now();
		const dayInMs = 24 * 60 * 60 * 1000;
		const thirtyDaysAgo = now - 30 * dayInMs;

		const today: ChatSession[] = [];
		const past30Days: ChatSession[] = [];
		const older: ChatSession[] = [];

		this.settings.chatSessions.forEach((session) => {
			if (session.timestamp > now - dayInMs) {
				today.push(session);
			} else if (session.timestamp > thirtyDaysAgo) {
				past30Days.push(session);
			} else {
				older.push(session);
			}
		});

		// Render sections using DOM API
		this.renderHistorySection(container, "Today", today);
		this.renderHistorySection(container, "Past 30 days", past30Days);
		this.renderHistorySection(container, "Older", older);
	}

	// Add method to format timestamp
	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();

		if (date.toDateString() === now.toDateString()) {
			return date.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
		}
		return date.toLocaleDateString();
	}

	// Update filterChatHistory method to fix search
	private filterChatHistory(query: string) {
		const historyView =
			this.chatContainer.querySelector(".chat-history-view");
		if (!historyView) return;

		const items = historyView.querySelectorAll(".history-item");
		items.forEach((item) => {
			const title =
				item
					.querySelector(".history-item-title")
					?.textContent?.toLowerCase() || "";
			if (title.includes(query.toLowerCase())) {
				item.classList.remove("hidden");
				item.classList.add("visible");
			} else {
				item.classList.add("hidden");
				item.classList.remove("visible");
			}
		});
	}

	// Update showMainChatView method
	private async showMainChatView() {
		// Remove history view if present
		const historyView = this.chatContainer.querySelector(".chat-history-view");
		if (historyView) {
			historyView.remove();
		}

		// Show all main chat elements with proper display classes
		const elementsToShow = [
			".bot-info",
			".chat-input-container",
			".gemini-chat-messages",
		];

		elementsToShow.forEach((selector) => {
			const el = this.chatContainer.querySelector(selector);
			if (el) {
				el.classList.remove("gemini-hidden");
				if (selector === ".gemini-chat-messages") {
					el.classList.add("gemini-visible-flex");
				} else {
					el.classList.add("gemini-visible");
				}
			}
		});

		if (this.messagesContainer) {
			// Clear existing messages before adding new ones
			this.messagesContainer.innerHTML = "";

			// Only show messages if we have a current session
			if (this.currentSession && this.currentSession.messages.length > 0) {
				// Hide bot info and suggested actions if there are messages
				const botInfo = this.chatContainer.querySelector(".bot-info");
				const suggestedActions = this.chatContainer.querySelector(
					".vaultai-suggested-actions"
				);

				if (botInfo) {
					botInfo.classList.add("hidden");
					setTimeout(() => botInfo.remove(), 300);
				}

				if (suggestedActions) {
					suggestedActions.classList.add("hidden");
					setTimeout(() => suggestedActions.remove(), 300);
				}

				// Create a new array with sorted messages
				const sortedMessages = [...this.currentSession.messages].sort(
					(a, b) => a.timestamp - b.timestamp
				);

				// Display messages in chronological order
				for (const message of sortedMessages) {
					const messageEl = document.createElement("div");
					messageEl.className = `gemini-message-${message.role}`;

					if (message.role === "bot") {
						// Add copy button for bot messages
						const copyButton = document.createElement("button");
						copyButton.textContent = "Copy to new note";
						copyButton.className = "copy-response-button";

						copyButton.addEventListener("click", async () => {
							try {
								const title = this.generateNoteTitle(message.content);
								const file = await this.app.vault.create(
									`${title}.md`,
									message.content
								);
								const leaf = this.app.workspace.getLeaf(false);
								await leaf.openFile(file);
								new Notice("Response copied to new note!");
							} catch (error) {
								console.error("Failed to create note:", error);
								new Notice("Failed to create note");
							}
						});

						messageEl.appendChild(copyButton);

						// Render markdown for bot messages
						await MarkdownRenderer.render(
							this.app,
							message.content,
							messageEl,
							"",
							this
						);
					} else {
						// For user messages, show the visible content
						const visibleContent = this.stripContextFromMessage(
							message.content
						);
						messageEl.textContent = visibleContent;
					}

					this.messagesContainer.appendChild(messageEl);
				}

				this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
				this.toggleSuggestedActions(false);
			} else {
				// Show suggested actions for new chat
				this.recreateBotInfoAndSuggestions();
				this.toggleSuggestedActions(true);
			}
		}
	}

	// Add method to recreate bot info and suggestions when needed
	private recreateBotInfoAndSuggestions() {
		// Recreate bot-info and suggested-actions if they don't exist
		const existingBotInfo = this.chatContainer.querySelector(".bot-info");
		const existingSuggestedActions = this.chatContainer.querySelector(
			".vaultai-suggested-actions"
		);

		if (!existingBotInfo) {
			const botInfo = this.createBotInfo();
			// Insert bot-info after the header
			const header = this.chatContainer.querySelector(
				".gemini-chat-header"
			);
			header?.after(botInfo);
		}

		if (!existingSuggestedActions) {
			const suggestedActions = this.createSuggestedActions();
			// Insert vaultai-suggested-actions before the chat input container
			const inputContainer = this.chatContainer.querySelector(
				".chat-input-container"
			);
			inputContainer?.before(suggestedActions);

			// Reattach event listeners for action buttons
			this.addActionButtonListeners();
		}
	}

	// Add this method to handle file selection
	private async showFileSelectionModal() {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const files = this.app.vault.getMarkdownFiles();
		const modal = new FileSelectionModal(this.app, async (file) => {
			if (file && this.inputField) {
				const content = await this.app.vault.read(file);
				// Add file reference to input at cursor position
				const cursorPos = this.inputField.selectionStart;
				const currentValue = this.inputField.value;
				const newValue =
					currentValue.slice(0, cursorPos) +
					`@${file.basename} ` +
					currentValue.slice(cursorPos);
				this.inputField.value = newValue;

				// Store the file content to be used in the prompt
				this.referencedFiles = this.referencedFiles || new Map();
				this.referencedFiles.set(file.basename, content);

				this.inputField.focus();
			}
		});
		modal.open();
	}

	// Add method to truncate content intelligently
	private truncateContent(content: string): string {
		if (content.length <= this.MAX_CONTEXT_LENGTH) {
			return content;
		}

		// Try to find a good breaking point
		const relevantPart = content.slice(0, this.MAX_CONTEXT_LENGTH);
		const lastParagraph = relevantPart.lastIndexOf("\n\n");
		if (lastParagraph !== -1) {
			return (
				relevantPart.slice(0, lastParagraph) +
				"\n\n[Content truncated for length...]"
			);
		}

		return relevantPart + "[Content truncated for length...]";
	}

	// Add this method to format the bot's response
	private async formatBotResponse(container: HTMLElement, content: string) {
		// Create header with copy button
		const headerDiv = container.createDiv("response-header");
		const copyButton = headerDiv.createEl("button", {
			text: "Copy to new note",
			cls: "copy-response-button",
		});

		copyButton.addEventListener("click", async () => {
			// Create new note with response content
			const fileName = `AI Response ${new Date()
				.toLocaleString()
				.replace(/[/:\\]/g, "-")}`;
			const file = await this.app.vault.create(`${fileName}.md`, content);

			// Open the new file
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);

			// Show notification
			new Notice("Response copied to new note!");
		});

		// Create content container with proper formatting
		const contentDiv = container.createDiv("response-content");
		await MarkdownRenderer.render(this.app, content, contentDiv, "", this);
	}

	// Add method to generate creative titles
	private generateNoteTitle(content: string): string {
		// Try to identify the type of content
		const isQuiz =
			content.toLowerCase().includes("quiz") ||
			content.toLowerCase().includes("question");
		const isSummary =
			content.toLowerCase().includes("summary") ||
			content.toLowerCase().includes("summarize");
		const isTranslation =
			content.toLowerCase().includes("translation") ||
			content.toLowerCase().includes("translated");

		// Get current file name if available
		const activeFile = this.app.workspace.getActiveFile();
		const fileName = activeFile ? activeFile.basename : "";

		// Generate base title based on content type
		let title = "";
		if (isQuiz) {
			title = `Quiz - ${fileName}`;
		} else if (isSummary) {
			title = `Summary - ${fileName}`;
		} else if (isTranslation) {
			const langMatch = content.match(/translated? to (\w+)/i);
			const language = langMatch ? langMatch[1] : "Other Language";
			title = `${language} Translation - ${fileName}`;
		} else {
			// For other types, try to extract meaningful content
			const headingMatch = content.match(/^#\s+(.+)$/m);
			if (headingMatch) {
				title = `${headingMatch[1].trim()} - ${fileName}`;
			} else {
				const firstLine = content.split("\n")[0].trim();
				if (firstLine && firstLine.length < 50) {
					title = `${firstLine} - ${fileName}`;
				} else {
					// Fallback: Use timestamp
					const now = new Date();
					title = `AI Response ${now.toLocaleString("en-US", {
						month: "short",
						day: "numeric",
						hour: "numeric",
						minute: "2-digit",
					})}`;
				}
			}
		}

		// Sanitize the title by removing invalid characters
		return title.replace(/[\\/:*?"<>|]/g, "-");
	}

	private addResizeFunctionality(handle: HTMLElement) {
		let isResizing = false;
		let startWidth: number;
		let startHeight: number;
		let startX: number;
		let startY: number;
		let startBottom: number;
		let startRight: number;

		handle.addEventListener("mousedown", (e: MouseEvent) => {
			isResizing = true;
			startWidth = this.chatContainer.offsetWidth;
			startHeight = this.chatContainer.offsetHeight;
			startX = e.clientX;
			startY = e.clientY;

			// Store the original bottom and right positions
			const rect = this.chatContainer.getBoundingClientRect();
			startBottom = window.innerHeight - rect.bottom;
			startRight = window.innerWidth - rect.right;

			// Add resizing class for visual feedback
			this.chatContainer.addClass("is-resizing");

			// Add event listeners
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", stopResize);

			// Prevent text selection while resizing
			e.preventDefault();
			document.body.style.userSelect = "none";
		});

		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return;

			// Calculate new dimensions (expanding leftward and upward)
			const deltaX = startX - e.clientX;
			const deltaY = startY - e.clientY;

			const newWidth = Math.min(
				Math.max(startWidth + deltaX, 320), // Minimum width: 320px
				Math.min(window.innerWidth - 40, 900) // Maximum width: 900px or window width - 40px
			);

			const newHeight = Math.min(
				Math.max(startHeight + deltaY, 400), // Minimum height: 400px
				Math.min(window.innerHeight - 40, 900) // Maximum height: 900px or window height - 40px
			);

			// Update container dimensions using CSS custom properties
			this.chatContainer.removeClass("default-size");
			this.chatContainer.addClass("dynamic-size");
			this.chatContainer.style.setProperty(
				"--dynamic-width",
				`${newWidth}px`
			);
			this.chatContainer.style.setProperty(
				"--dynamic-height",
				`${newHeight}px`
			);

			// Maintain position relative to bottom-right corner
			this.chatContainer.style.bottom = `${startBottom}px`;
			this.chatContainer.style.right = `${startRight}px`;
		};

		const stopResize = () => {
			isResizing = false;
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", stopResize);
			
			// Remove resizing class and restore user selection
			this.chatContainer.removeClass("is-resizing");
			document.body.style.userSelect = "";
		};
	}
}

class GeminiChatbotSettingTab extends PluginSettingTab {
	plugin: GeminiChatbotPlugin;

	constructor(app: App, plugin: GeminiChatbotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Gemini API key")
			.setDesc("Enter your Gemini API key (stored securely)")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.apiKey ? "••••••••" : "")
					.onChange(async (value) => {
						if (value !== "••••••••") {
							this.plugin.settings.apiKey =
								this.plugin.encryptApiKey(value);
							await this.plugin.saveSettings();
							this.plugin.initializeGeminiService();
						}
					});

				// Add show/hide password toggle
				const toggleButton = text.inputEl.createEl("button", {
					text: "️",
					cls: "password-toggle",
				});

				toggleButton.addEventListener("click", (e) => {
					e.preventDefault();
					text.inputEl.type =
						text.inputEl.type === "password" ? "text" : "password";
				});
			});
	}
}
