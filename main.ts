import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian"
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
	private lastApiCall = 0
	private readonly API_COOLDOWN = 1000 // 1 second cooldown between calls
	private readonly MAX_CONTEXT_LENGTH = 30000 // Limit context length to avoid token limits

	async onload() {
		// Add Font Awesome CSS
		const fontAwesomeLink = document.createElement("link")
		fontAwesomeLink.rel = "stylesheet"
		fontAwesomeLink.href =
			"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
		document.head.appendChild(fontAwesomeLink)

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

		// Check API cooldown
		const now = Date.now()
		if (now - this.lastApiCall < this.API_COOLDOWN) {
			this.addErrorMessage("Please wait a moment before sending another message")
			return
		}

		this.toggleSuggestedActions(false)

		// Build context more efficiently
		let contextMessage = message
		let context = ""

		// Add referenced file content if any
		const fileReferences = message.match(/@([^\s]+)/g)
		if (fileReferences) {
			contextMessage = message.replace(/@([^\s]+)/g, "").trim()
			for (const ref of fileReferences) {
				const fileName = ref.slice(1)
				const fileContent = this.referencedFiles?.get(fileName)
				if (fileContent) {
					// Add only the first part of long files
					const truncatedContent = this.truncateContent(fileContent)
					context += `\nRelevant content from ${fileName}:\n${truncatedContent}\n`
				}
			}
		}

		// Add current file content if available and no specific file was referenced
		const activeFile = this.app.workspace.getActiveFile()
		if (activeFile && !fileReferences) {
			const content = await this.app.vault.read(activeFile)
			// Add only relevant parts of the current file
			const truncatedContent = this.truncateContent(content)
			context += `\nRelevant content from current note:\n${truncatedContent}\n`
		}

		// Prepare the final message
		const finalMessage = context ? `${context}\n\nUser question: ${contextMessage}` : contextMessage

		const userMessage: ChatMessage = {
			role: "user",
			content: finalMessage,
			timestamp: Date.now(),
		}

		await this.addMessageToChat({
			...userMessage,
			content: contextMessage,
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
			this.lastApiCall = Date.now() // Update last API call time
			const response = await this.geminiService.sendMessage(finalMessage)
			typingIndicator.remove()

			const botMessage: ChatMessage = {
				role: "bot",
				content: response,
				timestamp: Date.now(),
			}

			await this.addMessageToChat(botMessage)

			if (this.currentSession) {
				if (this.currentSession.messages.length === 2) {
					this.currentSession.title = this.generateSessionTitle(userMessage.content)
				}

				this.settings.chatSessions = [
					this.currentSession,
					...this.settings.chatSessions.filter((s) => s.id !== this.currentSession?.id),
				]

				await this.saveSettings()
			}
		} catch (error) {
			typingIndicator.remove()

			// Better error handling
			let errorMessage = "Failed to get response from Gemini"
			if (error instanceof Error) {
				if (error.message.includes("429")) {
					errorMessage = "Rate limit reached. Please wait a moment before trying again."
				} else if (error.message.includes("quota")) {
					errorMessage = "API quota exceeded. Please try again later."
				}
			}
			this.addErrorMessage(errorMessage)
		}
	}

	private async addMessageToChat(message: ChatMessage) {
		if (!this.messagesContainer) return

		const messageEl = document.createElement("div")
		messageEl.addClass(`gemini-message-${message.role}`)

		if (message.role === "bot") {
			// Add copy button
			const copyButton = messageEl.createEl("button", {
				text: "Copy to new note",
				cls: "copy-response-button",
			})

			copyButton.addEventListener("click", async () => {
				// Generate creative title based on content
				const title = this.generateNoteTitle(message.content)
				const file = await this.app.vault.create(`${title}.md`, message.content)
				const leaf = this.app.workspace.getLeaf(false)
				await leaf.openFile(file)
				new Notice("Response copied to new note!")
			})

			// Directly render markdown
			await MarkdownRenderer.renderMarkdown(message.content, messageEl, "", this)
		} else {
			// For user messages, just show the visible part
			const visibleContent = this.stripContextFromMessage(message.content)
			messageEl.textContent = visibleContent
		}

		this.messagesContainer.appendChild(messageEl)
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight

		if (this.currentSession) {
			this.currentSession.messages.push(message)
		}
	}

	// Add new method for typing animation
	private async typeMessage(text: string, container: HTMLElement) {
		// First render the markdown but keep it hidden
		await MarkdownRenderer.renderMarkdown(text, container, "", this)
		const elements = Array.from(container.children)
		container.empty()

		for (const element of elements) {
			if (element instanceof HTMLElement) {
				if (element.tagName === "P") {
					// For paragraphs, type each character
					const text = element.textContent || ""
					const p = container.createEl("p")
					for (const char of text) {
						p.textContent += char
						await new Promise((resolve) => setTimeout(resolve, 10)) // Adjust speed here
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

		// Set initial default size
		this.chatContainer.style.width = "380px"
		this.chatContainer.style.height = "590px"

		// Add chat components
		this.chatContainer.innerHTML = `
			<div class="gemini-chat-header">
				<div class="current-file"></div>
				<div class="chat-header-controls">
					<button class="history-button">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"></circle>
							<polyline points="12 6 12 12 16 14"></polyline>
						</svg>
					</button>
					<button class="more-button">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
							<line x1="3" y1="12" x2="21" y2="12"></line>
							<line x1="12" y1="3" x2="12" y2="21"></line>
						</svg>
					</button>
					<button class="close-button">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>
			</div>
			
			<div class="bot-info">
				<div class="bot-avatar">
					<svg viewBox="0 0 1080 1080" fill="none" xmlns="http://www.w3.org/2000/svg">
						<defs>
							<filter id="filter" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="linearRGB">
								<feMorphology operator="dilate" radius="20 20" in="SourceAlpha" result="morphology"/>
								<feFlood flood-color="#ffffff" flood-opacity="1" result="flood"/>
								<feComposite in="flood" in2="morphology" operator="in" result="composite"/>
								<feMerge result="merge">
									<feMergeNode in="composite" result="mergeNode"/>
									<feMergeNode in="SourceGraphic" result="mergeNode1"/>
								</feMerge>
							</filter>
						</defs>
						<g id="notion-avatar" filter="url(#filter)">
							<g id="notion-avatar-face" fill="#ffffff">
								<title>Face/ 5</title>
								<g id="Face/-5" stroke="none" stroke-width="1" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round">
									<path d="M532,379 C664.54834,379 772,486.45166 772,619 C772,751.54834 704.54834,859 532,859 C405.842528,859 335.866563,801.559592 307.358668,718.866959 C265.336704,716.464588 232,681.625396 232,639 C232,599.134956 261.158843,566.080325 299.312086,560.00055 C325.599297,455.979213 419.809919,379 532,379 Z M295.858895,624.545187 L304.141105,655.454813" id="Path" stroke="#000000" stroke-width="24"/>
								</g>
							</g>
							<g id="notion-avatar-nose">
								<title>Nose/ 5</title>
								<g id="Nose/-5" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round">
									<path d="M673,568 C662.55102,590.836147 657.326531,613.414126 657.326531,635.733939 C657.326531,669.213657 673,686.992054 670.061224,702.552554 C668.102041,712.92622 653.081633,714.756867 625,708.044495" id="Path" stroke="#000000" stroke-width="16"/>
								</g>
							</g>
							<g id="notion-avatar-mouth">
								<title>Mouth/ 1</title>
								<g id="Mouth/-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round">
									<path d="M549,759 C575.12979,773.666667 603.12979,781 633,781 C662.87021,781 682.87021,773.666667 693,759" id="Path" stroke="#000000" stroke-width="16"/>
								</g>
							</g>
							<g id="notion-avatar-eyes">
								<title>Eyes/ 7</title>
								<g id="Eyes/-7" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
									<path d="M570,516 C578.836556,516 586,526.745166 586,540 C586,553.254834 578.836556,564 570,564 C561.163444,564 554,553.254834 554,540 C554,526.745166 561.163444,516 570,516 Z M708,516 C716.836556,516 724,526.745166 724,540 C724,553.254834 716.836556,564 708,564 C699.163444,564 692,553.254834 692,540 C692,526.745166 699.163444,516 708,516 Z M568,527 C564.686292,527 562,529.686292 562,533 C562,536.313708 564.686292,539 568,539 C571.313708,539 574,536.313708 574,533 C574,529.686292 571.313708,527 568,527 Z M706,527 C702.686292,527 700,529.686292 700,533 C700,536.313708 702.686292,539 706,539 C709.313708,539 712,536.313708 712,533 C712,529.686292 709.313708,527 706,527 Z" id="Combined-Shape" fill="#000000"/>
								</g>
							</g>
							<g id="notion-avatar-eyebrows">
								<title>Eyebrows/ 1</title>
								<g id="Eyebrows/-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="square" stroke-linejoin="round">
									<g id="Group" transform="translate(521.000000, 490.000000)" stroke="#000000" stroke-width="20">
										<path d="M0,16 C12.8888889,5.33333333 27.8888889,0 45,0 C62.1111111,0 77.1111111,5.33333333 90,16" id="Path"/>
										<path d="M146,16 C158.888889,5.33333333 173.888889,0 191,0 C208.111111,0 223.111111,5.33333333 236,16" id="Path"/>
									</g>
								</g>
							</g>
							<g id="notion-avatar-hair">
								<title>Hairstyle/ 25</title>
								<g id="Hairstyle/-25" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round">
									<path d="M227,151 C291,143 344.152059,161.487028 368.024158,212.689811 C410.238527,194.447151 459.304239,186 515,186 C629.125983,186 703.747536,236.594939 747,304 C779.083989,354 792.083989,420.666667 786,504 L782.3412,503.1612 C722.927067,489.4804 699,484 661,460 C635.666667,444 602.333333,419.666667 561,387 C524.333333,437 495.333333,470 474,486 C442,510 357,547 304,565 C251,583 232,598 232,648 C232,681.333333 258.666667,705 312,719 C325.996223,746.033167 340.996223,769.366501 357,789 C373.003777,808.633499 393.003777,825.633499 417,840 C335.666667,855.333333 262.333333,855.333333 197,840 C131.666667,824.666667 79.3333333,791 40,739 C94.6666667,735 127.666667,710.333333 139,665 C169.469054,543.123784 93,519 93,379 C93,239 147.699952,160.912506 227,151 Z" id="Path" stroke="#000000" stroke-width="12" fill="#000000"/>
								</g>
							</g>
						</g>
					</svg>
				</div>
				<div class="bot-greeting">Hello, How can I help you today?</div>
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
					<span class="action-icon">📚</span>
					Make a quiz
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
						<button class="mention-button">@</button>
						<button class="send-button">↑</button>
					</div>
				</div>
			</div>
		`

		document.body.appendChild(this.chatContainer)

		// Add event listeners for the buttons
		this.addChatEventListeners()

		// Add resize handle
		const resizeHandle = document.createElement("div")
		resizeHandle.addClass("resize-handle")
		this.chatContainer.appendChild(resizeHandle)

		// Add resize functionality
		this.addResizeFunctionality(resizeHandle)
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

		// Simplify action buttons handlers
		const actionButtons = this.chatContainer.querySelectorAll(".action-button")
		actionButtons.forEach((button) => {
			button.addEventListener("click", () => {
				if (!this.inputField) return

				// Simply set the input value based on the action
				if (button.textContent?.includes("Summarize")) {
					this.inputField.value = "Can you summarize this note for me?"
				} else if (button.textContent?.includes("Ask about")) {
					this.inputField.value = "What is this note about?"
				} else if (button.textContent?.includes("Make a quiz")) {
					this.inputField.value = "Can you create a quiz using this note?"
				} else if (button.textContent?.includes("Translate")) {
					new LanguageSelectionModal(this.app, (language: string) => {
						if (this.inputField) {
							this.inputField.value = `Can you translate this note to ${language}?`
						}
					}).open()
				}

				// Focus the input
				this.inputField.focus()
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
		moreButton?.addEventListener("click", async () => {
			// Check if window is already at default size
			if (
				this.chatContainer.style.width === "380px" &&
				this.chatContainer.style.height === "590px"
			) {
				return
			}

			// Add resetting class for animation
			this.chatContainer.classList.add("resetting")

			// Reset size with smooth transition
			this.chatContainer.style.width = "380px"
			this.chatContainer.style.height = "590px"

			// Remove resetting class after animation
			setTimeout(() => {
				this.chatContainer.classList.remove("resetting")
			}, 400) // Match the new animation duration
		})

		// Add @ button handler
		const mentionButton = this.chatContainer.querySelector(".mention-button")
		mentionButton?.addEventListener("click", () => {
			this.showFileSelectionModal()
		})
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
		const isVisible = this.chatContainer.style.display !== "none"

		if (isVisible) {
			// Add closing animation
			this.chatContainer.classList.add("closing")
			// Wait for animation to complete before hiding
			await new Promise((resolve) => setTimeout(resolve, 300))
			this.chatContainer.style.display = "none"
			this.chatContainer.classList.remove("closing")
		} else {
			this.chatContainer.style.display = "flex"
			this.currentSession = this.createNewSession()
			this.showMainChatView()
			this.toggleSuggestedActions(true)

			const activeFile = this.app.workspace.getActiveFile()
			if (activeFile) {
				this.currentFileContent = await this.app.vault.read(activeFile)
				this.updateChatHeader()
			} else {
				this.currentFileContent = null
				this.updateChatHeader()
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
		// Remove Font Awesome CSS
		const fontAwesomeLink = document.querySelector('link[href*="font-awesome"]')
		if (fontAwesomeLink) {
			fontAwesomeLink.remove()
		}

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
		const headerEl = this.chatContainer.querySelector(".current-file") as HTMLElement
		if (headerEl && activeFile) {
			headerEl.textContent = activeFile.basename
			headerEl.style.display = "block"
		} else if (headerEl) {
			headerEl.style.display = "none"
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
		const cleanMessage = firstMessage.replace(/[#*`]/g, "").trim()

		// Check for specific patterns in the message
		if (cleanMessage.toLowerCase().includes("summarize")) {
			return "📝 Summary: " + this.extractDocumentName(cleanMessage)
		}

		if (cleanMessage.toLowerCase().includes("translate")) {
			return "🌐 Translation: " + this.extractDocumentName(cleanMessage)
		}

		if (
			cleanMessage.toLowerCase().includes("action items") ||
			cleanMessage.toLowerCase().includes("tasks")
		) {
			return "✅ Tasks from: " + this.extractDocumentName(cleanMessage)
		}

		// For questions
		if (cleanMessage.endsWith("?")) {
			return (
				"❓ " + (cleanMessage.length > 40 ? cleanMessage.substring(0, 40) + "..." : cleanMessage)
			)
		}

		// For general chat, try to extract key topic
		const keywords = this.extractKeywords(cleanMessage)
		if (keywords) {
			return "💭 Chat about " + keywords
		}

		// Fallback to default with timestamp
		return (
			"💬 Chat from " +
			new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			})
		)
	}

	private extractDocumentName(message: string): string {
		// Try to find the document name in the message
		const lines = message.split("\n")
		if (lines.length > 1) {
			// Take the first non-empty line after the first line
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i].trim()
				if (line) {
					return line.length > 30 ? line.substring(0, 30) + "..." : line
				}
			}
		}
		return "Document"
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
		])

		// Split message into words and filter
		const words = message
			.toLowerCase()
			.replace(/[^\w\s]/g, "")
			.split(/\s+/)
			.filter((word) => !commonWords.has(word) && word.length > 2)
			.slice(0, 3)

		if (words.length > 0) {
			// Capitalize first letters
			const formattedWords = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			return formattedWords.join(", ")
		}

		return ""
	}

	// Update showChatHistoryView method
	private showChatHistoryView() {
		if (!this.chatContainer) return

		// Hide all other elements
		const elementsToHide = [
			".bot-info",
			".suggested-actions",
			".chat-input-container",
			".gemini-chat-messages",
		]

		elementsToHide.forEach((selector) => {
			const el = this.chatContainer.querySelector(selector)
			if (el) (el as HTMLElement).style.display = "none"
		})

		// Remove existing history view if any
		const existingHistoryView = this.chatContainer.querySelector(".chat-history-view")
		if (existingHistoryView) {
			existingHistoryView.classList.add("closing")
			setTimeout(() => {
				existingHistoryView.remove()
			}, 300)
			return
		}

		// Create and show history view
		const historyView = document.createElement("div")
		historyView.addClass("chat-history-view")
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
		`

		this.chatContainer.appendChild(historyView)

		// Add back button handler with animation
		const backBtn = historyView.querySelector(".back-button")
		backBtn?.addEventListener("click", () => {
			historyView.classList.add("closing")
			setTimeout(() => {
				historyView.remove()
				this.showMainChatView()
			}, 300)
		})

		// Add event listeners
		const newChatBtn = historyView.querySelector(".new-chat-button")
		newChatBtn?.addEventListener("click", () => {
			this.currentSession = this.createNewSession()
			historyView.remove()
			this.showMainChatView()
		})

		// Add click handlers for history items
		this.attachHistoryItemListeners(historyView)

		const searchInput = historyView.querySelector("input")
		searchInput?.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value
			this.filterChatHistory(query)
		})
	}

	// Update renderHistorySection to include delete button
	private renderHistorySection(title: string, sessions: ChatSession[]): string {
		if (sessions.length === 0) return ""

		return `
			<div class="history-section">
				<h3>${title}</h3>
				${sessions
					.map(
						(session) => `
					<div class="history-item" data-session-id="${session.id}">
						<div class="history-item-icon">💬</div>
						<div class="history-item-content">
							<div class="history-item-title">${session.title}</div>
							<div class="history-item-time">${this.formatTime(session.timestamp)}</div>
						</div>
						<div class="delete-chat" data-session-id="${session.id}">
							<svg width="14" height="14" viewBox="0 0 24 24">
								<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12l1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/>
							</svg>
						</div>
					</div>
				`,
					)
					.join("")}
			</div>
		`
	}

	// Add method to handle chat deletion
	private deleteChat(sessionId: string) {
		const historyItem = this.chatContainer.querySelector(
			`.history-item[data-session-id="${sessionId}"]`,
		)
		if (historyItem) {
			historyItem.classList.add("deleting")

			// Wait for the animation to complete before removing the item
			setTimeout(() => {
				// Remove the session from settings
				this.settings.chatSessions = this.settings.chatSessions.filter((s) => s.id !== sessionId)
				this.saveSettings()

				// Remove the item from the DOM
				historyItem.remove()

				// Re-render the chat history sections
				const sectionsContainer = this.chatContainer.querySelector(".chat-history-sections")
				if (sectionsContainer) {
					sectionsContainer.innerHTML = this.renderChatHistorySections()
					this.attachHistoryItemListeners(sectionsContainer as HTMLElement)
				}
			}, 300) // Match the duration of the fadeOut animation
		}
	}

	// Add method to attach event listeners to history items
	private attachHistoryItemListeners(historyView: HTMLElement) {
		// Delete buttons
		const deleteButtons = historyView.querySelectorAll(".delete-chat")
		deleteButtons.forEach((btn) => {
			btn.addEventListener("click", (e) => {
				e.stopPropagation() // Prevent triggering the history item click
				const sessionId = btn.getAttribute("data-session-id")
				if (sessionId) {
					this.deleteChat(sessionId)
				}
			})
		})

		// History items
		const historyItems = historyView.querySelectorAll(".history-item")
		historyItems.forEach((item) => {
			item.addEventListener("click", () => {
				const sessionId = item.getAttribute("data-session-id")
				const session = this.settings.chatSessions.find((s) => s.id === sessionId)
				if (session) {
					this.currentSession = { ...session }
					this.showMainChatView()
					historyView.remove()
				}
			})
		})
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
		const historyView = this.chatContainer.querySelector(".chat-history-view")
		if (!historyView) return

		const items = historyView.querySelectorAll(".history-item")
		items.forEach((item) => {
			const title = item.querySelector(".history-item-title")?.textContent?.toLowerCase() || ""
			if (title.includes(query.toLowerCase())) {
				;(item as HTMLElement).style.display = "flex"
			} else {
				;(item as HTMLElement).style.display = "none"
			}
		})
	}

	// Update showMainChatView method
	private showMainChatView() {
		// Show all main chat elements
		const elementsToShow = [".bot-info", ".chat-input-container", ".gemini-chat-messages"]

		elementsToShow.forEach((selector) => {
			const el = this.chatContainer.querySelector(selector)
			if (el)
				(el as HTMLElement).style.display = selector === ".gemini-chat-messages" ? "flex" : "block"
		})

		if (this.messagesContainer) {
			this.messagesContainer.innerHTML = ""

			// Only show messages if we have a current session
			if (this.currentSession) {
				this.currentSession.messages.forEach((message) => this.addMessageToChat(message))
				this.toggleSuggestedActions(false)
			} else {
				// Show suggested actions for new chat
				this.toggleSuggestedActions(true)
			}
		}
	}

	// Add this method to handle file selection
	private async showFileSelectionModal() {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const files = this.app.vault.getMarkdownFiles()
		const modal = new FileSelectionModal(this.app, async (file) => {
			if (file && this.inputField) {
				const content = await this.app.vault.read(file)
				// Add file reference to input at cursor position
				const cursorPos = this.inputField.selectionStart
				const currentValue = this.inputField.value
				const newValue =
					currentValue.slice(0, cursorPos) + `@${file.basename} ` + currentValue.slice(cursorPos)
				this.inputField.value = newValue

				// Store the file content to be used in the prompt
				this.referencedFiles = this.referencedFiles || new Map()
				this.referencedFiles.set(file.basename, content)

				this.inputField.focus()
			}
		})
		modal.open()
	}

	// Add method to truncate content intelligently
	private truncateContent(content: string): string {
		if (content.length <= this.MAX_CONTEXT_LENGTH) {
			return content
		}

		// Try to find a good breaking point
		const relevantPart = content.slice(0, this.MAX_CONTEXT_LENGTH)
		const lastParagraph = relevantPart.lastIndexOf("\n\n")
		if (lastParagraph !== -1) {
			return relevantPart.slice(0, lastParagraph) + "\n\n[Content truncated for length...]"
		}

		return relevantPart + "[Content truncated for length...]"
	}

	// Add this method to format the bot's response
	private async formatBotResponse(container: HTMLElement, content: string) {
		// Create header with copy button
		const headerDiv = container.createDiv("response-header")
		const copyButton = headerDiv.createEl("button", {
			text: "Copy to new note",
			cls: "copy-response-button",
		})

		copyButton.addEventListener("click", async () => {
			// Create new note with response content
			const fileName = `AI Response ${new Date().toLocaleString().replace(/[/:\\]/g, "-")}`
			const file = await this.app.vault.create(`${fileName}.md`, content)

			// Open the new file
			const leaf = this.app.workspace.getLeaf(false)
			await leaf.openFile(file)

			// Show notification
			new Notice("Response copied to new note!")
		})

		// Create content container with proper formatting
		const contentDiv = container.createDiv("response-content")
		await MarkdownRenderer.renderMarkdown(content, contentDiv, "", this)
	}

	// Add method to generate creative titles
	private generateNoteTitle(content: string): string {
		// Try to identify the type of content
		const isQuiz =
			content.toLowerCase().includes("quiz") || content.toLowerCase().includes("question")
		const isSummary =
			content.toLowerCase().includes("summary") || content.toLowerCase().includes("summarize")
		const isTranslation =
			content.toLowerCase().includes("translation") || content.toLowerCase().includes("translated")

		// Get current file name if available
		const activeFile = this.app.workspace.getActiveFile()
		const fileName = activeFile ? activeFile.basename : ""

		// Generate base title based on content type
		let title = ""
		if (isQuiz) {
			title = `Quiz - ${fileName}`
		} else if (isSummary) {
			title = `Summary - ${fileName}`
		} else if (isTranslation) {
			const langMatch = content.match(/translated? to (\w+)/i)
			const language = langMatch ? langMatch[1] : "Other Language"
			title = `${language} Translation - ${fileName}`
		} else {
			// For other types, try to extract meaningful content
			const headingMatch = content.match(/^#\s+(.+)$/m)
			if (headingMatch) {
				title = `${headingMatch[1].trim()} - ${fileName}`
			} else {
				const firstLine = content.split("\n")[0].trim()
				if (firstLine && firstLine.length < 50) {
					title = `${firstLine} - ${fileName}`
				} else {
					// Fallback: Use timestamp
					const now = new Date()
					title = `AI Response ${now.toLocaleString("en-US", {
						month: "short",
						day: "numeric",
						hour: "numeric",
						minute: "2-digit",
					})}`
				}
			}
		}

		// Sanitize the title by removing invalid characters
		return title.replace(/[\\/:*?"<>|]/g, "-")
	}

	private addResizeFunctionality(handle: HTMLElement) {
		let isResizing = false
		let startWidth: number
		let startHeight: number
		let startX: number
		let startY: number
		let startBottom: number
		let startRight: number

		handle.addEventListener("mousedown", (e: MouseEvent) => {
			isResizing = true
			startWidth = this.chatContainer.offsetWidth
			startHeight = this.chatContainer.offsetHeight
			startX = e.clientX
			startY = e.clientY

			// Store the original bottom and right positions
			const rect = this.chatContainer.getBoundingClientRect()
			startBottom = window.innerHeight - rect.bottom
			startRight = window.innerWidth - rect.right

			// Add event listeners
			document.addEventListener("mousemove", handleMouseMove)
			document.addEventListener("mouseup", stopResize)

			// Prevent text selection while resizing
			e.preventDefault()
		})

		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return

			// Calculate new dimensions (expanding leftward and upward)
			const deltaX = startX - e.clientX
			const deltaY = startY - e.clientY

			const newWidth = Math.min(
				Math.max(startWidth + deltaX, 380), // Minimum width: 380px
				800, // Maximum width: 800px
			)

			const newHeight = Math.min(
				Math.max(startHeight + deltaY, 500), // Minimum height: 500px
				800, // Maximum height: 800px
			)

			// Update container dimensions
			this.chatContainer.style.width = `${newWidth}px`
			this.chatContainer.style.height = `${newHeight}px`

			// Maintain position relative to bottom-right corner
			this.chatContainer.style.bottom = `${startBottom}px`
			this.chatContainer.style.right = `${startRight}px`
		}

		const stopResize = () => {
			isResizing = false
			document.removeEventListener("mousemove", handleMouseMove)
			document.removeEventListener("mouseup", stopResize)
		}
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
					text: "��️",
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
