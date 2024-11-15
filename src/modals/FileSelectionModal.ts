import { App, TFile, FuzzySuggestModal, FuzzyMatch } from 'obsidian';

export class FileSelectionModal extends FuzzySuggestModal<TFile> {
    private onChoose: (file: TFile) => void;

    constructor(app: App, onChoose: (file: TFile) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder("Type to search for a file...");
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(file);
    }

    renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
        const file = match.item;
        el.createEl("div", { text: file.basename });
        const path = el.createEl("div", { text: file.parent?.path ?? "" });
        path.addClass("suggestion-path");
    }
} 