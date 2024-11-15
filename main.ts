import { App, Plugin, PluginSettingTab, Setting } from "obsidian"
import { GeminiService } from "./src/services/GeminiService"
import { LanguageSelectionModal } from "./src/modals/LanguageSelectionModal"
import { MarkdownRenderer } from "obsidian"
import { FileSelectionModal } from "./src/modals/FileSelectionModal"

interface ChatMessage {
	role: "user" | "bot"
	content: string
	timestamp: number
}

interface ChatSession {
	id: string
	title: string
	timestamp: number
	messages: ChatMessage[]
}

interface GeminiChatbotSettings {
	apiKey: string
	floatingPosition: {
		x: number
		y: number
	}
	isDocked: boolean
	chatSessions: ChatSession[]
}

const DEFAULT_SETTINGS: GeminiChatbotSettings = {
	apiKey: "",
	floatingPosition: {
		x: 20,
		y: 20,
	},
	isDocked: false,
	chatSessions: [],
}

export default class GeminiChatbotPlugin extends Plugin {
	settings: GeminiChatbotSettings
	chatIcon: HTMLElement
	chatContainer: HTMLElement
	private geminiService: GeminiService | null = null
	private messagesContainer: HTMLElement | null = null
	private inputField: HTMLTextAreaElement | null = null
	private currentFileContent: string | null = null
	private chatHistory: ChatMessage[] = []
	private isFullPage = false
	private currentSession: ChatSession | null = null
	private referencedFiles: Map<string, string> | null = null

	async onload() {
		await this.loadSettings()
		if (this.settings.apiKey) {
			this.initializeGeminiService()
		}

		// Add settings tab
		this.addSettingTab(new GeminiChatbotSettingTab(this.app, this))

		// Add floating chat icon
		this.addFloatingIcon()

		// Add chat container
		this.addChatContainer()
	}

	public initializeGeminiService() {
		try {
			if (this.settings.apiKey) {
				const decryptedKey = this.decryptApiKey(this.settings.apiKey)
				this.geminiService = new GeminiService(decryptedKey)
			}
		} catch (error) {
			console.error("Failed to initialize Gemini service:", error)
		}
	}

	private async handleMessage(message: string) {
		if (!this.geminiService || !message.trim()) return

		this.toggleSuggestedActions(false)

		// Build context
		let contextMessage = message
		let context = ''

		// Add referenced file content if any
		const fileReferences = message.match(/@([^\s]+)/g)
		if (fileReferences) {
			contextMessage = message.replace(/@([^\s]+)/g, '').trim() // Remove @ references
			fileReferences.forEach(ref => {
				const fileName = ref.slice(1)
				const fileContent = this.referencedFiles?.get(fileName)
				if (fileContent) {
					context += `\nContent from ${fileName}:\n${fileContent}\n`
				}
			})
		}

		// Add current file content if available and no specific file was referenced
		const activeFile = this.app.workspace.getActiveFile()
		if (activeFile && !fileReferences) {
			const content = await this.app.vault.read(activeFile)
			context += `\nContent from current note:\n${content}\n`
		}

		// Prepare the final message
		const finalMessage = context
			? `${context}\n\nUser question: ${contextMessage}`
			: contextMessage

		const userMessage: ChatMessage = {
			role: 'user',
			content: finalMessage,
			timestamp: Date.now()
		}

		// Show only the user's question in the chat
		await this.addMessageToChat({
			...userMessage,
			content: contextMessage // Show only the actual question
		})

		// Add typing indicator
		const typingIndicator = document.createElement("div")
		typingIndicator.addClass("typing-indicator")
		typingIndicator.innerHTML = `
			<span></span>
			<span></span>
			<span></span>
		`
		this.messagesContainer?.appendChild(typingIndicator)

		try {
			const response = await this.geminiService.sendMessage(finalMessage)
			typingIndicator.remove()

			const botMessage: ChatMessage = {
				role: "bot",
				content: response,
				timestamp: Date.now(),
			}

			await this.addMessageToChat(botMessage)

			// Save the current session after each message exchange
			if (this.currentSession) {
				// Update session title after first exchange
				if (this.currentSession.messages.length === 2) { // After first user message and bot response
					this.currentSession.title = this.generateSessionTitle(userMessage.content)
				}
				
				// Update sessions array
				this.settings.chatSessions = [
					this.currentSession,
					...this.settings.chatSessions.filter((s) => s.id !== this.currentSession?.id),
				]
				
				await this.saveSettings()
			}
		} catch (error) {
			typingIndicator.remove()
			this.addErrorMessage("Failed to get response from Gemini")
		}
	}

	private async addMessageToChat(message: ChatMessage) {
		if (!this.messagesContainer) return

		const messageEl = document.createElement('div')
		messageEl.addClass(`gemini-message-${message.role}`)

		if (message.role === 'bot') {
			// Create a container for markdown content
			const markdownContainer = messageEl.createDiv()
			
			if (message.content) {
				// Add typing animation for bot messages
				await this.typeMessage(message.content, markdownContainer)
			}
		} else {
			// For user messages, just show the visible part (not the context)
			const visibleContent = this.stripContextFromMessage(message.content)
			messageEl.textContent = visibleContent
		}

		this.messagesContainer.appendChild(messageEl)
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight

		this.chatHistory.push(message)

		if (this.currentSession) {
			this.currentSession.messages.push(message)
		}
	}

	// Add new method for typing animation
	private async typeMessage(text: string, container: HTMLElement) {
		// First render the markdown but keep it hidden
		await MarkdownRenderer.renderMarkdown(text, container, '', this)
		const elements = Array.from(container.children)
		container.empty()

		for (const element of elements) {
			if (element instanceof HTMLElement) {
				if (element.tagName === 'P') {
					// For paragraphs, type each character
					const text = element.textContent || ''
					const p = container.createEl('p')
					for (const char of text) {
						p.textContent += char
						await new Promise(resolve => setTimeout(resolve, 10)) // Adjust speed here
						if (this.messagesContainer) {
							this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
						}
					}
				} else {
					// For other elements (code blocks, lists, etc.), add them instantly
					container.appendChild(element)
				}
			}
		}
	}

	// Add method to strip context from messages
	private stripContextFromMessage(message: string): string {
		// Remove the context part from the message
		const userQuestionMatch = message.match(/User question: (.*?)$/m)
		if (userQuestionMatch) {
			return userQuestionMatch[1].trim()
		}
		return message
	}

	private addErrorMessage(message: string) {
		if (!this.messagesContainer) return

		const errorEl = document.createElement("div")
		errorEl.addClass("gemini-message-error")
		errorEl.textContent = message
		this.messagesContainer.appendChild(errorEl)
	}

	private addFloatingIcon() {
		this.chatIcon = document.createElement("div")
		this.chatIcon.addClass("gemini-chat-icon")
		this.chatIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
		</svg>`

		// Add click handler
		this.chatIcon.addEventListener("click", () => {
			this.toggleChatContainer()
		})

		document.body.appendChild(this.chatIcon)
	}

	private addChatContainer() {
		this.chatContainer = document.createElement("div")
		this.chatContainer.addClass("gemini-chat-container")
		this.chatContainer.style.display = "none"

		// Add chat components
		this.chatContainer.innerHTML = `
			<div class="gemini-chat-header">
				<div class="current-file"></div>
				<div class="chat-header-controls">
					<button class="history-button">
						<svg width="16" height="16" viewBox="0 0 24 24">
							<path fill="currentColor" d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
						</svg>
					</button>
					<button class="more-button">•••</button>
					<button class="close-button">×</button>
				</div>
			</div>
			
			<div class="bot-info">
				<div class="bot-avatar">
					<svg width="20" height="20" viewBox="0 0 24 24">
						<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
					</svg>
				</div>
				<div class="bot-greeting">Hi Neo xD! How can I help you today?</div>
			</div>

			<div class="gemini-chat-messages"></div>

			<div class="suggested-actions">
				<h3>Suggested</h3>
				<div class="action-button">
					<span class="action-icon">📝</span>
					Summarize this page
				</div>
				<div class="action-button">
					<span class="action-icon">🔍</span>
					Ask about this page
				</div>
				<div class="action-button">
					<span class="action-icon">✓</span>
					Find action items
				</div>
				<div class="action-button">
					<span class="action-icon">🌐</span>
					Translate to
				</div>
			</div>

			<div class="chat-input-container">
				<div class="chat-input-wrapper">
					<textarea class="chat-input" placeholder="Ask anything or select..."></textarea>
					<div class="input-actions">
						<button class="attach-button">
							<svg width="16" height="16" viewBox="0 0 24 24">
								<path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
							</svg>
						</button>
						<button class="mention-button">@</button>
						<button class="send-button">↑</button>
					</div>
				</div>
			</div>
		`

		document.body.appendChild(this.chatContainer)

		// Add event listeners for the buttons
		this.addChatEventListeners()
	}

	private addChatEventListeners() {
		const closeButton = this.chatContainer.querySelector(".close-button")
		closeButton?.addEventListener("click", () => {
			this.toggleChatContainer()
		})

		const sendButton = this.chatContainer.querySelector(".send-button")
		const inputField = this.chatContainer.querySelector(".chat-input") as HTMLTextAreaElement
		this.inputField = inputField
		this.messagesContainer = this.chatContainer.querySelector(".gemini-chat-messages")

		sendButton?.addEventListener("click", () => {
			if (this.inputField) {
				const message = this.inputField.value.trim()
				if (message) {
					this.handleMessage(message)
					this.inputField.value = ""
				}
			}
		})

		inputField?.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && this.inputField) {
				e.preventDefault()
				const message = this.inputField.value.trim()
				if (message) {
					this.handleMessage(message)
					this.inputField.value = ""
				}
			}
		})

		// Update action buttons handlers
		const actionButtons = this.chatContainer.querySelectorAll(".action-button")
		actionButtons.forEach((button) => {
			button.addEventListener("click", async () => {
				const action = button.textContent?.trim()

				if (!this.currentFileContent) {
					this.addErrorMessage("No active file selected")
					return
				}

				// Hide suggested actions when selecting an action
				this.toggleSuggestedActions(false)

				switch (action) {
					case "Summarize this page":
						this.handleMessage(
							`Please provide a concise summary of this content:\n${this.currentFileContent}`,
						)
						break

					case "Ask about this page":
						if (this.inputField) {
							this.inputField.focus()
							this.inputField.placeholder = "Ask a question about this page..."
						}
						break

					case "Find action items":
						this.handleMessage(
							`Please analyze this content and list all action items, tasks, and to-dos:\n${this.currentFileContent}`,
						)
						break

					case "Translate to":
						this.showLanguageSelectionModal(this.currentFileContent)
						break
				}
			})
		})

		// Update history button handler
		const historyButton = this.chatContainer.querySelector(".history-button")
		historyButton?.addEventListener("click", () => {
			// Show chat history view instead of just showing messages
			this.showChatHistoryView()
		})

		// Add more options menu
		const moreButton = this.chatContainer.querySelector(".more-button")
		moreButton?.addEventListener("click", (event) => {
			const menu = document.createElement("div")
			menu.addClass("more-options-menu")
			menu.innerHTML = `
				<div class="menu-item toggle-full-page">
					<svg width="16" height="16" viewBox="0 0 24 24">
						<path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
					</svg>
					Toggle Full Page
				</div>
				<div class="menu-item clear-history">
					<svg width="16" height="16" viewBox="0 0 24 24">
						<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/>
					</svg>
					Clear History
				</div>
			`

			// Position the menu
			const rect = (event.target as HTMLElement).getBoundingClientRect()
			menu.style.top = `${rect.bottom + 5}px`
			menu.style.right = `${window.innerWidth - rect.right}px`

			// Add menu item handlers
			menu.querySelector(".toggle-full-page")?.addEventListener("click", () => {
				this.toggleFullPageChat()
				menu.remove()
			})

			menu.querySelector(".clear-history")?.addEventListener("click", () => {
				this.chatHistory = []
				if (this.messagesContainer) {
					this.messagesContainer.innerHTML = ""
				}
				menu.remove()
			})

			// Close menu when clicking outside
			const closeMenu = (e: MouseEvent) => {
				if (!menu.contains(e.target as Node)) {
					menu.remove()
					document.removeEventListener("click", closeMenu)
				}
			}

			document.addEventListener("click", closeMenu)
			document.body.appendChild(menu)
		})

		// Add @ button handler
		const mentionButton = this.chatContainer.querySelector('.mention-button');
		mentionButton?.addEventListener('click', () => {
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
						})
					})
					.catch((error) => {
						this.addErrorMessage("Translation failed")
						console.error("Translation error:", error)
					})
			}
		}).open()
	}

	private async toggleChatContainer() {
		const isVisible = this.chatContainer.style.display !== 'none';
		this.chatContainer.style.display = isVisible ? 'none' : 'flex';
		
		if (!isVisible) {
			// Start new session
			this.currentSession = this.createNewSession();
			
			// Show main chat view with welcome screen
			this.showMainChatView();
			this.toggleSuggestedActions(true);
			
			// Check for active file
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				// Store the content but don't show it in the UI
				this.currentFileContent = await this.app.vault.read(activeFile);
				// Update header with file name
				this.updateChatHeader();
			} else {
				this.currentFileContent = null;
				this.updateChatHeader();
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	onunload() {
		this.chatIcon?.remove()
		this.chatContainer?.remove()
	}

	public encryptApiKey(key: string): string {
		return btoa(key.split("").reverse().join(""))
	}

	public decryptApiKey(encryptedKey: string): string {
		return atob(encryptedKey).split("").reverse().join("")
	}

	// Add this method to handle showing/hiding suggested actions
	private toggleSuggestedActions(show: boolean) {
		const suggestedActions = this.chatContainer.querySelector(".suggested-actions") as HTMLElement
		if (suggestedActions) {
			suggestedActions.style.display = show ? "block" : "none"
		}
	}

	private updateChatHeader() {
		const activeFile = this.app.workspace.getActiveFile()
		const headerEl = this.chatContainer.querySelector(".current-file")
		if (headerEl && activeFile) {
			headerEl.textContent = activeFile.basename
			;(headerEl as HTMLElement).style.display = "block"
		} else if (headerEl) {
			(headerEl as HTMLElement).style.display = "none"
		}
	}

	// Add this method to handle full page toggle
	private toggleFullPageChat() {
		this.isFullPage = !this.isFullPage
		if (this.isFullPage) {
			this.chatContainer.addClass("full-page")
		} else {
			this.chatContainer.removeClass("full-page")
		}
	}

	// Add method to create new chat session
	private createNewSession(): ChatSession {
		return {
			id: Date.now().toString(),
			title: "New chat",
			timestamp: Date.now(),
			messages: [],
		}
	}

	// Add method to generate session title
	private generateSessionTitle(firstMessage: string): string {
		// Remove any markdown formatting
		const cleanMessage = firstMessage.replace(/[#*`]/g, '').trim();
		
		// Check for specific patterns in the message
		if (cleanMessage.toLowerCase().includes('summarize')) {
			return "📝 Summary: " + this.extractDocumentName(cleanMessage);
		}
		
		if (cleanMessage.toLowerCase().includes('translate')) {
			return "🌐 Translation: " + this.extractDocumentName(cleanMessage);
		}
		
		if (cleanMessage.toLowerCase().includes('action items') || 
			cleanMessage.toLowerCase().includes('tasks')) {
			return "✅ Tasks from: " + this.extractDocumentName(cleanMessage);
		}
		
		// For questions
		if (cleanMessage.endsWith('?')) {
			return "❓ " + (cleanMessage.length > 40 
				? cleanMessage.substring(0, 40) + "..."
				: cleanMessage);
		}
		
		// For general chat, try to extract key topic
		const keywords = this.extractKeywords(cleanMessage);
		if (keywords) {
			return "💭 Chat about " + keywords;
		}
		
		// Fallback to default with timestamp
		return "💬 Chat from " + new Date().toLocaleTimeString([], { 
			hour: '2-digit', 
			minute: '2-digit' 
		});
	}

	private extractDocumentName(message: string): string {
		// Try to find the document name in the message
		const lines = message.split('\n');
		if (lines.length > 1) {
			// Take the first non-empty line after the first line
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line) {
					return line.length > 30 ? line.substring(0, 30) + "..." : line;
				}
			}
		}
		return "Document";
	}

	private extractKeywords(message: string): string {
		// Remove common words and get key topics
		const commonWords = new Set([
			'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
			'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
			'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her',
			'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
			'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get',
			'which', 'go', 'me', 'please', 'could', 'can', 'just'
		]);
		
		// Split message into words and filter
		const words = message.toLowerCase()
			.replace(/[^\w\s]/g, '')
			.split(/\s+/)
			.filter(word => !commonWords.has(word) && word.length > 2)
			.slice(0, 3);
		
		if (words.length > 0) {
			// Capitalize first letters
			const formattedWords = words.map(word => 
				word.charAt(0).toUpperCase() + word.slice(1)
			);
			return formattedWords.join(', ');
		}
		
		return '';
	}

	// Update showChatHistoryView method
	private showChatHistoryView() {
		if (!this.chatContainer) return;

		// Hide all other elements
		const elementsToHide = [
			'.bot-info',
			'.suggested-actions',
			'.chat-input-container',
			'.gemini-chat-messages'
			];
		
		elementsToHide.forEach(selector => {
			const el = this.chatContainer.querySelector(selector);
			if (el) (el as HTMLElement).style.display = 'none';
		});

		// Remove existing history view if any
		const existingHistoryView = this.chatContainer.querySelector('.chat-history-view');
		if (existingHistoryView) {
			existingHistoryView.remove();
		}

		// Create and show history view
		const historyView = document.createElement('div');
		historyView.addClass('chat-history-view');
		historyView.innerHTML = `
			<div class="chat-history-header">
				<div class="back-button">
					<svg width="16" height="16" viewBox="0 0 24 24">
						<path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
					</svg>
				</div>
				<h2>All chats</h2>
				<div class="new-chat-button">New chat</div>
			</div>
			<div class="chat-history-search">
				<input type="text" placeholder="Search or start new chat">
			</div>
			<div class="chat-history-sections">
				${this.renderChatHistorySections()}
			</div>
		`;

		this.chatContainer.appendChild(historyView);

		// Add event listeners
		const backBtn = historyView.querySelector('.back-button');
		backBtn?.addEventListener('click', () => {
			historyView.remove();
			this.showMainChatView();
		});

		const newChatBtn = historyView.querySelector('.new-chat-button');
		newChatBtn?.addEventListener('click', () => {
			this.currentSession = this.createNewSession();
			historyView.remove();
			this.showMainChatView();
		});

		// Add click handlers for history items
		this.attachHistoryItemListeners(historyView);

		const searchInput = historyView.querySelector('input');
		searchInput?.addEventListener('input', (e) => {
			const query = (e.target as HTMLInputElement).value;
			this.filterChatHistory(query);
		});
	}

	// Update renderHistorySection to include delete button
	private renderHistorySection(title: string, sessions: ChatSession[]): string {
		if (sessions.length === 0) return '';

		return `
			<div class="history-section">
				<h3>${title}</h3>
				${sessions.map(session => `
					<div class="history-item" data-session-id="${session.id}">
						<div class="history-item-icon">💬</div>
						<div class="history-item-content">
							<div class="history-item-title">${session.title}</div>
							<div class="history-item-time">${this.formatTime(session.timestamp)}</div>
						</div>
						<div class="delete-chat" data-session-id="${session.id}">
							<svg width="14" height="14" viewBox="0 0 24 24">
								<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
							</svg>
						</div>
					</div>
				`).join('')}
			</div>
		`;
	}

	// Add method to handle chat deletion
	private deleteChat(sessionId: string) {
		this.settings.chatSessions = this.settings.chatSessions.filter(s => s.id !== sessionId);
		this.saveSettings();
		
		// Refresh the history view
		const historyView = this.chatContainer.querySelector('.chat-history-view');
		if (historyView) {
			const sectionsContainer = historyView.querySelector('.chat-history-sections');
			if (sectionsContainer) {
				sectionsContainer.innerHTML = this.renderChatHistorySections();
				// Reattach event listeners for new elements
				this.attachHistoryItemListeners(historyView as HTMLElement);
			}
		}
	}

	// Add method to attach event listeners to history items
	private attachHistoryItemListeners(historyView: HTMLElement) {
		// Delete buttons
		const deleteButtons = historyView.querySelectorAll('.delete-chat');
		deleteButtons.forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation(); // Prevent triggering the history item click
				const sessionId = btn.getAttribute('data-session-id');
				if (sessionId) {
					this.deleteChat(sessionId);
				}
			});
		});

		// History items
		const historyItems = historyView.querySelectorAll('.history-item');
		historyItems.forEach(item => {
			item.addEventListener('click', () => {
				const sessionId = item.getAttribute('data-session-id');
				const session = this.settings.chatSessions.find(s => s.id === sessionId);
				if (session) {
					this.currentSession = { ...session };
					this.showMainChatView();
					historyView.remove();
				}
			});
		});
	}

	// Add method to render chat history sections
	private renderChatHistorySections(): string {
		const now = Date.now()
		const dayInMs = 24 * 60 * 60 * 1000
		const thirtyDaysAgo = now - 30 * dayInMs

		const today: ChatSession[] = []
		const past30Days: ChatSession[] = []
		const older: ChatSession[] = []

		this.settings.chatSessions.forEach((session) => {
			if (session.timestamp > now - dayInMs) {
				today.push(session)
			} else if (session.timestamp > thirtyDaysAgo) {
				past30Days.push(session)
			} else {
				older.push(session)
			}
		})

		return `
			${this.renderHistorySection("Today", today)}
			${this.renderHistorySection("Past 30 days", past30Days)}
			${this.renderHistorySection("Older", older)}
		`
	}

	// Add method to format timestamp
	private formatTime(timestamp: number): string {
		const date = new Date(timestamp)
		const now = new Date()

		if (date.toDateString() === now.toDateString()) {
			return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		}
		return date.toLocaleDateString()
	}

	// Update filterChatHistory method to fix search
	private filterChatHistory(query: string) {
		const historyView = this.chatContainer.querySelector('.chat-history-view');
		if (!historyView) return;

		const items = historyView.querySelectorAll('.history-item');
		items.forEach(item => {
			const title = item.querySelector('.history-item-title')?.textContent?.toLowerCase() || '';
			if (title.includes(query.toLowerCase())) {
				(item as HTMLElement).style.display = 'flex';
			} else {
				(item as HTMLElement).style.display = 'none';
			}
		});
	}

	// Update showMainChatView method
	private showMainChatView() {
		// Show all main chat elements
		const elementsToShow = [
			'.bot-info',
			'.chat-input-container',
			'.gemini-chat-messages'
		];
		
		elementsToShow.forEach(selector => {
			const el = this.chatContainer.querySelector(selector);
			if (el) (el as HTMLElement).style.display = selector === '.gemini-chat-messages' ? 'flex' : 'block';
		});

		if (this.messagesContainer) {
			this.messagesContainer.innerHTML = '';

			// Only show messages if we have a current session
			if (this.currentSession) {
				this.currentSession.messages.forEach(message => 
					this.addMessageToChat(message)
				);
				this.toggleSuggestedActions(false);
			} else {
				// Show suggested actions for new chat
				this.toggleSuggestedActions(true);
			}
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
}

class GeminiChatbotSettingTab extends PluginSettingTab {
	plugin: GeminiChatbotPlugin

	constructor(app: App, plugin: GeminiChatbotPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName("Gemini API Key")
			.setDesc("Enter your Gemini API key (stored securely)")
			.addText((text) => {
				text.inputEl.type = "password"
				text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.apiKey ? "••••••••" : "")
					.onChange(async (value) => {
						if (value !== "••••••••") {
							this.plugin.settings.apiKey = this.plugin.encryptApiKey(value)
							await this.plugin.saveSettings()
							this.plugin.initializeGeminiService()
						}
					})

				// Add show/hide password toggle
				const toggleButton = text.inputEl.createEl("button", {
					text: "👁️",
					cls: "password-toggle",
				})
				toggleButton.style.position = "absolute"
				toggleButton.style.right = "5px"
				toggleButton.style.top = "50%"
				toggleButton.style.transform = "translateY(-50%)"
				toggleButton.style.background = "transparent"
				toggleButton.style.border = "none"
				toggleButton.style.cursor = "pointer"

				toggleButton.addEventListener("click", (e) => {
					e.preventDefault()
					text.inputEl.type = text.inputEl.type === "password" ? "text" : "password"
				})
			})
	}
}
