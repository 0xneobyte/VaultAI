import { App, Modal, Setting } from 'obsidian';

export class LanguageSelectionModal extends Modal {
    private result: string;
    private onChoose: (language: string) => void;

    constructor(app: App, onChoose: (language: string) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Select Target Language' });

        const languages = [
            'Arabic', 'Chinese', 'English', 'French', 'German',
            'Hindi', 'Italian', 'Japanese', 'Korean', 'Portuguese',
            'Russian', 'Spanish'
        ];

        new Setting(contentEl)
            .setName('Language')
            .addDropdown(dropdown => {
                languages.forEach(lang => dropdown.addOption(lang.toLowerCase(), lang));
                dropdown.onChange(value => {
                    this.result = value;
                });
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Translate')
                .setCta()
                .onClick(() => {
                    this.onChoose(this.result);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 