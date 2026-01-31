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
-   **⚙️ Model Configuration** - Fine-tune AI responses with customizable temperature, top-K, top-P, and token limits ([Configuration Guide](../../wiki/Model-Configuration))
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


