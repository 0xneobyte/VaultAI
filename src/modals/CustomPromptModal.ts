import { App, Modal, Setting } from "obsidian";

export class CustomPromptModal extends Modal {
	private name: string;
	private description: string;
	private prompt: string;
	private onSubmit: (name: string, description: string, prompt: string) => void;
	private title: string;

	constructor(
		app: App,
		title: string,
		name: string,
		description: string,
		prompt: string,
		onSubmit: (name: string, description: string, prompt: string) => void
	) {
		super(app);
		this.title = title;
		this.name = name;
		this.description = description;
		this.prompt = prompt;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.title });

		// Name input
		new Setting(contentEl)
			.setName("Prompt Name")
			.setDesc("A short, descriptive name for this prompt")
			.addText((text) => {
				text.setPlaceholder("e.g., Summarize Text")
					.setValue(this.name)
					.onChange((value) => {
						this.name = value;
					});
				text.inputEl.focus();
			});

		// Description input
		new Setting(contentEl)
			.setName("Description")
			.setDesc("Optional description of what this prompt does")
			.addText((text) => {
				text.setPlaceholder("e.g., Summarizes the selected text or current note")
					.setValue(this.description)
					.onChange((value) => {
						this.description = value;
					});
			});

		// Prompt content
		new Setting(contentEl)
			.setName("Prompt Content")
			.setDesc("The actual prompt text. Use {{selection}} for selected text and {{content}} for full note content")
			.addTextArea((text) => {
				text.setPlaceholder("e.g., Please summarize the following text:\n\n{{selection}}")
					.setValue(this.prompt)
					.onChange((value) => {
						this.prompt = value;
					});
				text.inputEl.rows = 6;
				text.inputEl.style.width = "100%";
				text.inputEl.style.minHeight = "120px";
			});

		// Helper text
		const helperDiv = contentEl.createDiv();
		helperDiv.style.marginTop = "10px";
		helperDiv.style.padding = "10px";
		helperDiv.style.backgroundColor = "var(--background-secondary)";
		helperDiv.style.borderRadius = "6px";
		helperDiv.style.fontSize = "14px";
		helperDiv.style.color = "var(--text-muted)";

		helperDiv.createEl("strong", { text: "Available placeholders:" });
		const placeholderList = helperDiv.createEl("ul");
		placeholderList.style.marginTop = "8px";
		placeholderList.style.marginBottom = "0";

		const placeholder1 = placeholderList.createEl("li");
		placeholder1.innerHTML = "<code>{{selection}}</code> - Currently selected text";

		const placeholder2 = placeholderList.createEl("li");
		placeholder2.innerHTML = "<code>{{content}}</code> - Full content of the current note";

		// Buttons
		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.marginTop = "20px";

		const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => {
			this.close();
		});

		const submitButton = buttonContainer.createEl("button", { text: "Save" });
		submitButton.style.backgroundColor = "var(--interactive-accent)";
		submitButton.style.color = "var(--text-on-accent)";
		submitButton.addEventListener("click", () => {
			if (this.name.trim()) {
				this.onSubmit(this.name.trim(), this.description.trim(), this.prompt.trim());
				this.close();
			} else {
				// Show error - name is required
				const nameInput = contentEl.querySelector('input[placeholder*="Summarize Text"]') as HTMLInputElement;
				if (nameInput) {
					nameInput.style.borderColor = "var(--text-error)";
					nameInput.focus();
				}
			}
		});

		// Allow Enter to submit when focused on name or description
		contentEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
				e.preventDefault();
				submitButton.click();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}