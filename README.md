# 🤖 VaultAI - AI Writing Assistant for Obsidian

<div align="left">

![GitHub release (latest by date)](https://img.shields.io/github/v/release/0xneobyte/VaultAI)
![GitHub all releases](https://img.shields.io/github/downloads/0xneobyte/VaultAI/total)
![GitHub](https://img.shields.io/github/license/0xneobyte/VaultAI)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/0xneobyte/VaultAI)

Transform your note-taking with an **intelligent AI writing assistant** powered by Google's Gemini AI. VaultAI brings deep editor integration, custom prompts, and seamless content generation directly to your Obsidian workspace.

![Screen Recording Nov 16 2024](https://github.com/user-attachments/assets/c9aa500c-99ed-4ab4-9529-8e04090f2a06)

</div>

## 🚀 What's New in v1.0.6

### 🎯 **Deep Editor Integration**
- **📍 Insert Mode**: AI responses insert directly at your cursor position
- **Real-time cursor tracking** with line-by-line context awareness
- **Editor commands** via Command Palette (Generate, Complete, Explain, Improve)
- **Smart context** with 7-line surrounding code/text awareness

### ✨ **Custom Prompts System**
- **Create reusable prompts** with `{{selection}}` and `{{content}}` placeholders
- **Quick access** via 📝 Prompts button in chat interface
- **Command Palette integration** for instant prompt execution
- **Organized prompt management** in plugin settings

### ⌨️ **Enhanced Accessibility**
- **Keyboard shortcuts**: `Ctrl/Cmd+Shift+V` to toggle chat
- **Command Palette support**: Access all features via `Ctrl/Cmd+P`
- **Hotkey customization** for all commands

---

## 📑 Table of Contents

<details open>
<summary>Click to expand/collapse</summary>

### Getting Started

-   [✨ Features](#-features)
    -   [🎨 Modern Interface](#-modern-interface)
    -   [🧠 AI Capabilities](#-ai-capabilities)
    -   [📚 Organization](#-organization)
    -   [🔒 Security](#-security)
-   [🚀 Installation](#-installation)
    -   [Prerequisites](#prerequisites)
    -   [From Community Plugins](#from-obsidian-community-plugins)
    -   [Manual Installation](#manual-installation)
-   [⚙️ Setup](#️-setup)

### Using the Plugin

-   [💡 Usage](#-usage)
    -   [🎯 Quick Actions](#-quick-actions)
    -   [💬 Basic Interaction](#-basic-interaction)
    -   [📜 Chat History](#-chat-history)

### Additional Information

-   [🤝 Contributing](#-contributing)
-   [📄 License](#-license)
-   [💖 Support](#-support)

</details>

## ✨ Features

### � **Deep Editor Integration**
-   **📍 Insert Mode**: Toggle seamless content insertion at cursor position
-   **Real-time Context**: AI knows your current line, file, and surrounding content
-   **Editor Commands**: Generate, complete, explain, and improve text via Command Palette
-   **Smart Positioning**: Automatic cursor placement after content insertion

### ✨ **Custom Prompts System**
-   **Reusable Prompts**: Create custom prompts with smart placeholders
-   **Quick Access**: 📝 Prompts button for instant access in chat
-   **Placeholders**: Use `{{selection}}` for selected text, `{{content}}` for full note
-   **Command Integration**: Each prompt becomes a Command Palette command

### ⌨️ **Keyboard & Shortcuts**
-   **Global Hotkey**: `Ctrl/Cmd+Shift+V` to toggle chat anywhere
-   **Command Palette**: Full integration with Obsidian's command system
-   **Customizable**: Assign any hotkey to any VaultAI command

### 🎨 **Modern Interface**
-   **Floating Chat Interface**: Sleek, always-accessible chatbot widget
-   **Glassy Design**: Modern, translucent interface with smooth animations
-   **Resizable Window**: Adjust the chat window size from the top-left corner
-   **Full Page Mode**: Toggle between compact and full-page views

### 🧠 **AI Capabilities**
-   **Contextual Understanding**: AI comprehends your cursor position and document structure
-   **Smart Summarization**: Get concise summaries of your notes
-   **Content Generation**: Generate ideas and expand on topics with precise placement
-   **Multi-Language Support**: Translate content to different languages
-   **File References**: Reference multiple notes in your queries using @mentions

### 📚 **Organization & History**
-   **Chat History**: Browse and search through past conversations
-   **Session Management**: Organize chats with auto-generated titles
-   **Quick Actions**: Access common tasks through suggested actions
-   **Export Options**: Save AI responses as new notes

### 🔒 Security

-   **Secure API Storage**: Your Gemini API key is stored with encryption
-   **Local Processing**: All chat history stays in your vault
-   **Privacy Focused**: No data collection or external sharing

## 🚀 Installation

### Prerequisites

-   Obsidian v0.15.0 or higher
-   A Google Gemini API key ([Get it here](https://makersuite.google.com/app/apikey))

### From Obsidian Community Plugins

1. Open Obsidian Settings > Community plugins
2. Disable Safe mode
3. Click Browse and search for "VaultAI"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/0xneobyte/vaultai/releases)
2. Extract the files to your `.obsidian/plugins/vaultai` folder
3. Reload Obsidian
4. Enable the plugin in Settings > Community plugins

## ⚙️ Setup

1. Get your Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Open Obsidian Settings > VaultAI
3. Enter your API key
4. Start chatting!

## 💡 Usage

### 🎯 **Deep Editor Integration**

**Insert Mode** (Main Feature):
1. Place your cursor anywhere in a document
2. Open VaultAI chat (floating icon or `Ctrl/Cmd+Shift+V`)
3. Click the **📍 button** to enable Insert Mode
4. Ask AI anything - responses insert automatically at cursor!

**Editor Commands** (Command Palette):
- Press `Ctrl/Cmd+P` and search:
  - **"VaultAI: Generate content at cursor"** - Contextual content generation
  - **"VaultAI: Complete current line"** - Auto-complete current line
  - **"VaultAI: Explain selected text"** - Instant explanations
  - **"VaultAI: Improve selected text"** - Text enhancement suggestions

### ✨ **Custom Prompts**

**Creating Custom Prompts**:
1. Go to Settings → VaultAI → Custom Prompts
2. Click **"Add Prompt"**
3. Set name, description, and prompt content
4. Use `{{selection}}` for selected text, `{{content}}` for full note

**Using Custom Prompts**:
- **Chat Interface**: Click 📝 Prompts button → select your prompt
- **Command Palette**: `Ctrl/Cmd+P` → "Custom Prompt: [your prompt name]"
- **Hotkeys**: Assign keyboard shortcuts in Obsidian settings

### ⌨️ **Keyboard Shortcuts**

- **`Ctrl/Cmd+Shift+V`**: Toggle VaultAI chat
- **`Ctrl/Cmd+P`**: Access all VaultAI commands via Command Palette
- **Custom hotkeys**: Assign any key combination to prompts or commands

### 🎯 **Quick Actions**

-   **Summarize**: Get a concise summary of your current note
-   **Ask**: Ask questions about your note's content with cursor context
-   **Translate**: Translate your note to different languages
-   **Quiz**: Generate questions to test your understanding

### 💬 **Basic Interaction**

-   Click the chat icon in the bottom-right corner
-   Type your question or select a suggested action
-   Use @mention to reference specific notes
-   Click the resize handle (top-left) to adjust the window size
-   Toggle Insert Mode (📍) for automatic content insertion

### 📜 Chat History

-   Click the history icon to view past conversations
-   Search through previous chats
-   Delete unwanted conversations
-   Resume any previous chat session

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💖 Support

If you find this plugin helpful:

-   ⭐ Star the repository
-   🐛 Report issues on GitHub
-   💡 Submit feature requests
-   ☕ If you find this plugin helpful, consider supporting the development:
<p><a href="https://www.buymeacoffee.com/0xneobyte"> <img align="left" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" width="150" alt="neo_3xd" /></a></p><br><br>

---

<div align="center">

**Made with ❤️ by [Neo](https://github.com/0xneobyte)**

</div>
