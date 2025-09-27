import { App, Modal, Setting, Notice } from "obsidian";
import { MCPServerConfig } from "../services/MCPService";

export class MCPServerModal extends Modal {
    private serverConfig: MCPServerConfig;
    private onSave: (config: MCPServerConfig) => void;
    private isEdit: boolean;

    constructor(app: App, onSave: (config: MCPServerConfig) => void, serverConfig?: MCPServerConfig) {
        super(app);
        this.onSave = onSave;
        this.isEdit = !!serverConfig;
        this.serverConfig = serverConfig || {
            id: this.generateId(),
            name: "",
            type: "http",
            url: "",
            enabled: true,
            headers: {}
        };
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: this.isEdit ? "Edit MCP Server" : "Add MCP Server" });
        
        contentEl.createEl("p", { 
            text: "Configure an MCP (Model Context Protocol) server connection. Currently supports HTTP-based MCP servers that are compatible with browser environments.",
            cls: "setting-item-description"
        });

        // Server name
        new Setting(contentEl)
            .setName("Server Name")
            .setDesc("A friendly name for this MCP server")
            .addText(text => text
                .setPlaceholder("e.g., Local Filesystem")
                .setValue(this.serverConfig.name)
                .onChange(async (value) => {
                    this.serverConfig.name = value;
                })
            );

        // Server type
        new Setting(contentEl)
            .setName("Connection Type")
            .setDesc("Type of MCP server connection")
            .addDropdown(dropdown => dropdown
                .addOption("http", "HTTP")
                .addOption("sse", "Server-Sent Events")
                .setValue(this.serverConfig.type)
                .onChange(async (value) => {
                    this.serverConfig.type = value as "http" | "sse";
                })
            );

        // Server URL
        new Setting(contentEl)
            .setName("Server URL")
            .setDesc("URL of the MCP server endpoint")
            .addText(text => text
                .setPlaceholder("e.g., https://api.example.com/mcp")
                .setValue(this.serverConfig.url)
                .onChange(async (value) => {
                    this.serverConfig.url = value;
                })
            );

        // Headers
        new Setting(contentEl)
            .setName("Headers")
            .setDesc("HTTP headers (JSON format, e.g., {\"Authorization\": \"Bearer token\"})")
            .addTextArea(text => {
                text.inputEl.style.minHeight = "80px";
                text.setPlaceholder('{\n  "Authorization": "Bearer your-token",\n  "Content-Type": "application/json"\n}')
                    .setValue(JSON.stringify(this.serverConfig.headers || {}, null, 2))
                    .onChange(async (value) => {
                        try {
                            this.serverConfig.headers = value.trim() ? JSON.parse(value) : {};
                        } catch (e) {
                            // Keep previous value if JSON is invalid
                        }
                    });
            });

        // Enabled toggle
        new Setting(contentEl)
            .setName("Enabled")
            .setDesc("Connect to this server when VaultAI starts")
            .addToggle(toggle => toggle
                .setValue(this.serverConfig.enabled)
                .onChange(async (value) => {
                    this.serverConfig.enabled = value;
                })
            );

        // Common server examples
        const examplesEl = contentEl.createDiv("mcp-server-examples");
        examplesEl.createEl("h3", { text: "Common MCP Servers" });
        
        const examples = [
            {
                name: "Mock HTTP Server",
                type: "http",
                url: "https://api.example.com/mcp",
                description: "Example HTTP-based MCP server"
            },
            {
                name: "Local Development Server", 
                type: "http",
                url: "http://localhost:3000/mcp",
                description: "Local development MCP server"
            },
            {
                name: "SSE-based Server",
                type: "sse",
                url: "https://example.com/mcp/events",
                description: "Server-Sent Events based MCP server"
            }
        ];

        for (const example of examples) {
            const exampleEl = examplesEl.createDiv("mcp-server-example");
            exampleEl.createEl("strong", { text: example.name });
            exampleEl.createEl("p", { text: example.description });
            
            const useButton = exampleEl.createEl("button", { 
                text: "Use This Example",
                cls: "mod-cta"
            });
            
            useButton.addEventListener("click", () => {
                this.serverConfig.name = example.name;
                this.serverConfig.type = example.type as "http" | "sse";
                this.serverConfig.url = example.url;
                this.close();
                this.open(); // Reopen to show updated values
            });
        }

        // Action buttons
        const buttonContainer = contentEl.createDiv("modal-button-container");
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";
        buttonContainer.style.marginTop = "20px";

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.addEventListener("click", () => this.close());

        const saveButton = buttonContainer.createEl("button", { 
            text: this.isEdit ? "Update" : "Add",
            cls: "mod-cta"
        });
        
        saveButton.addEventListener("click", () => {
            if (this.validateConfig()) {
                this.onSave(this.serverConfig);
                this.close();
            }
        });
    }

    private validateConfig(): boolean {
        if (!this.serverConfig.name.trim()) {
            new Notice("Server name is required");
            return false;
        }
        
        if (!this.serverConfig.url.trim()) {
            new Notice("Server URL is required");
            return false;
        }
        
        return true;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}