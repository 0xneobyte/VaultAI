# VaultAI - AI Writing Assistant for Obsidian

![GitHub release (latest by date)](https://img.shields.io/github/v/release/0xneobyte/VaultAI)
![GitHub all releases](https://img.shields.io/github/downloads/0xneobyte/VaultAI/total)
![GitHub](https://img.shields.io/github/license/0xneobyte/VaultAI)
 <a href="https://deepwiki.com/0xneobyte/VaultAI">
    <img alt="Ask DeepWiki" src="https://deepwiki.com/badge.svg" />
  </a>

Transform your note-taking with an intelligent AI writing assistant powered by Google's Gemini AI. VaultAI brings deep editor integration, custom prompts, and seamless content generation directly to your Obsidian workspace.

![Screen Recording Nov 16 2024](https://github.com/user-attachments/assets/c9aa500c-99ed-4ab4-9529-8e04090f2a06)

## Key Features

-   **🧠 RAG (Retrieval Augmented Generation)** - Search across your entire vault with AI-powered semantic search using Google's Gemini File Search API. Ask questions and get answers grounded in your notes with citations
-   **⚙️ Flexible Model Configuration** - Choose your Gemini model and fine-tune parameters like temperature, top-k, top-p, and max tokens for optimal results
-   **Deep Editor Integration** - AI responses insert directly at your cursor position with real-time context awareness
-   **Custom Prompts System** - Create reusable prompts with smart placeholders for repeated workflows
-   **Keyboard Shortcuts** - Access all features via hotkeys and Command Palette integration
-   **Modern Interface** - Sleek, resizable chat interface with full-page mode
-   **Secure & Private** - Your API key and chat history stay local in your vault

## Quick Start

### Installation

1. Install from **Obsidian Community Plugins** by searching "VaultAI"
2. Get your **Gemini API key** from [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Configure the API key in **Settings → VaultAI**

### Basic Usage

-   Press `Ctrl/Cmd+Shift+V` to toggle chat
-   Click the pin button to enable Insert Mode for cursor-based insertion
-   Use Command Palette (`Ctrl/Cmd+P`) for quick AI commands

## 🧠 RAG - Vault-Wide AI Search

Transform your entire vault into an AI-powered knowledge base! VaultAI now supports RAG (Retrieval Augmented Generation) using Google's Gemini File Search API.

### How It Works
VaultAI indexes your vault and uses semantic search to find relevant notes when you ask questions. The AI then provides answers grounded in your actual notes with citations.

### Setup RAG
1. Open **Settings → VaultAI → RAG Settings**
2. Toggle **"Enable RAG"** to ON
3. Choose folder to index (use `/` for entire vault)
4. Click **"Sync Now"** and wait for completion
5. In chat, click the **🧠 button** to enable RAG mode

### Features
- **Smart Sync** - Only uploads new or modified files
- **Flexible Indexing** - Index entire vault or specific folders
- **Citation Support** - Responses indicate sources from your vault
- **Progress Tracking** - Real-time sync status updates

> **Note**: Inspired by [Discussion #22](https://github.com/0xneobyte/VaultAI/discussions/22) - turning your vault into something like Google Notebook LM!

## ⚙️ Model Configuration

Customize the AI behavior to match your needs! VaultAI supports full configuration of Gemini model parameters.

### Available Settings
Configure these options in **Settings → VaultAI → Model Configuration**:

1. **Model Name** - Choose which Gemini model to use:
   - `gemini-2.0-flash-exp` (default) - Latest experimental flash model
   - `gemini-1.5-pro` - Most capable model for complex tasks
   - `gemini-1.5-flash` - Fastest model for quick responses
   - Any other Gemini model available in your region

2. **Temperature** (0.0 - 2.0, default: 1.0)
   - Controls creativity and randomness in responses
   - Lower values (0.0-0.5): More focused, deterministic outputs
   - Higher values (1.5-2.0): More creative, varied outputs

3. **Top K** (1 - 100, default: 40)
   - Limits token selection to the K most likely candidates
   - Lower values: More focused, predictable responses
   - Higher values: More diverse language choices

4. **Top P** (0.0 - 1.0, default: 0.95)
   - Nucleus sampling threshold
   - Lower values: More conservative word choices
   - Higher values: More diverse vocabulary

5. **Max Output Tokens** (100 - 32768, default: 8192)
   - Maximum length of AI responses
   - Adjust based on your needs (longer responses = more tokens)

### Quick Tips
- Use **lower temperature** (0.3-0.5) for factual tasks, summarization, or code
- Use **higher temperature** (1.2-1.8) for creative writing or brainstorming
- The settings apply to all new conversations and features (chat, RAG, web search)
- Each setting has a reset button to restore defaults

## Documentation

For comprehensive guides, examples, and troubleshooting:

**[📚 Visit the VaultAI Wiki](../../wiki)**

-   [Installation Guide](../../wiki/Installation-Guide)
-   [Getting Started](../../wiki/Getting-Started)
-   [Deep Editor Integration](../../wiki/Deep-Editor-Integration)
-   [Custom Prompts Guide](../../wiki/Custom-Prompts-Guide)
-   [Keyboard Shortcuts](../../wiki/Keyboard-Shortcuts)
-   [Troubleshooting](../../wiki/Troubleshooting)

## Requirements

-   Obsidian v0.15.0 or higher
-   Google Gemini API key (free tier available)

## Support
If you find this plugin helpful:

-   [Report Issues](https://github.com/0xneobyte/VaultAI/issues)
-   [Feature Requests](https://github.com/0xneobyte/VaultAI/issues/new)
-   [Community Discussions](https://github.com/0xneobyte/VaultAI/discussions)

## Contributing

Contributions are welcome! Please see our [Contributing Guide](../../wiki/Contributing-Guide) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Made by [Neo](https://github.com/0xneobyte)**

<p><a href="https://www.buymeacoffee.com/0xneobyte"> <img align="left" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="150" alt="0xneobyte" /></a></p><br><br>


