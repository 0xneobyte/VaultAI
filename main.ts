import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface GeminiChatbotSettings {
	apiKey: string;
	floatingPosition: {
		x: number;
		y: number;
	};
	isDocked: boolean;
}

const DEFAULT_SETTINGS: GeminiChatbotSettings = {
	apiKey: '',
	floatingPosition: {
		x: 20,
		y: 20
	},
	isDocked: false
}

export default class GeminiChatbotPlugin extends Plugin {
	settings: GeminiChatbotSettings;
	
	async onload() {
		await this.loadSettings();
		
		// Add settings tab
		this.addSettingTab(new GeminiChatbotSettingTab(this.app, this));
		
		// Add floating chat icon
		this.addFloatingIcon();
	}
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings() {
		await this.saveData(this.settings);
	}
	
	private addFloatingIcon() {
		// TODO: Implement floating icon
	}
}

class GeminiChatbotSettingTab extends PluginSettingTab {
	plugin: GeminiChatbotPlugin;
	
	constructor(app: App, plugin: GeminiChatbotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	
	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		
		new Setting(containerEl)
			.setName('Gemini API Key')
			.setDesc('Enter your Gemini API key')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));
	}
}
