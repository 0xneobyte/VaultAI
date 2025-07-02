# Changelog

All notable changes to ObsiAI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2024-12-19

### 🔒 Security

-   **Fixed critical security vulnerabilities** - Replaced all `innerHTML` and `outerHTML` usage with secure DOM API methods
-   **Enhanced XSS protection** - Eliminated potential cross-site scripting attack vectors
-   **Improved code safety** - All HTML content now safely constructed using Obsidian's recommended DOM manipulation methods

### 🛠️ Technical Improvements

-   Refactored chat container creation to use secure DOM API instead of innerHTML
-   Replaced typing indicator HTML injection with safe element creation
-   Updated bot avatar and UI components to use `createSvg()` and DOM methods
-   Converted all dynamic HTML generation to use `createEl()`, `createDiv()`, and `appendChild()`
-   Improved message rendering to use `empty()` instead of `innerHTML = ""`

### 📝 Code Quality

-   Added helper methods for secure UI component creation:
    -   `createChatHeader()` - Secure header creation with SVG icons
    -   `createBotInfo()` - Safe bot avatar and greeting generation
    -   `createSuggestedActions()` - Secure action buttons creation
    -   `createInputContainer()` - Safe input area construction
-   Enhanced maintainability with modular component creation
-   Improved compliance with Obsidian plugin security standards

### ✅ Compatibility

-   Maintains full backward compatibility
-   No changes to user-facing features or functionality
-   All existing settings and chat history preserved

---

## [1.0.1] - Previous Release

-   Initial stable release with core AI chat functionality

## [1.0.0] - Initial Release

-   AI-powered chat interface with Google Gemini integration
-   Floating chat widget with modern UI design
-   File referencing and context-aware conversations
-   Multi-language translation support
-   Note summarization and quiz generation
-   Notion AI-inspired user experience
