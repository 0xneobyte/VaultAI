# VaultAI Codebase Architecture Overview

## Project Summary

**VaultAI** is an Obsidian plugin that integrates Google's Gemini AI into the Obsidian note-taking ecosystem. It provides a floating chat interface with deep editor integration, allowing users to:
- Summarize notes
- Generate content
- Translate text
- Answer questions based on note content
- Create custom prompts for repeated workflows

**Tech Stack:**
- TypeScript (4.7.4)
- Obsidian API (latest)
- Google Generative AI SDK (@google/generative-ai ^0.1.3)
- esbuild for bundling
- Modern CSS with theme awareness

---

## 1. CURRENT ARCHITECTURE AND MAIN COMPONENTS

### 1.1 Plugin Structure
```
VaultAI/
├── main.ts                    # Main plugin class (2600+ lines)
├── src/
│   ├── services/
│   │   └── GeminiService.ts   # AI provider integration
│   ├── modals/
│   │   ├── CustomPromptModal.ts
│   │   ├── FileSelectionModal.ts
│   │   └── LanguageSelectionModal.ts
│   └── fonts/                 # Custom font resources
├── styles.css                 # UI styling
├── manifest.json              # Plugin metadata
└── package.json               # Dependencies
```

### 1.2 Core Plugin Class: `GeminiChatbotPlugin`

**File:** `/home/user/VaultAI/main.ts` (Main entry point)

**Key Properties:**
```typescript
interface GeminiChatbotSettings {
  apiKey: string;              // Encrypted API key
  floatingPosition: { x: number; y: number };
  isDocked: boolean;
  chatSessions: ChatSession[];  // Session history
  customPrompts: CustomPrompt[];
}

interface ChatMessage {
  role: "user" | "bot";
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}
```

**Lifecycle Methods:**
- `onload()`: Initializes plugin, creates chat UI, registers commands
- `onunload()`: Cleans up UI elements
- `loadSettings()`: Loads encrypted settings from Obsidian vault
- `saveSettings()`: Persists settings to vault

### 1.3 Core Components

#### A. Floating Chat Interface
- **Chat Icon**: SVG icon in bottom-right corner
- **Chat Container**: Resizable floating panel (380x590px default)
- **Toggle on**: `Ctrl/Cmd+Shift+V` hotkey
- **Features**: Full-page mode, compact view, size reset

#### B. Chat UI Elements
1. **Header** (`.gemini-chat-header`)
   - Current file indicator
   - History button (chat sessions)
   - More options menu (full-screen, compact, reset, new chat)
   - Close button

2. **Bot Info** (`.bot-info`)
   - Avatar SVG
   - Greeting message
   - Shown on new chat

3. **Messages Container** (`.gemini-chat-messages`)
   - Displays chat history
   - Renders markdown with `MarkdownRenderer.render()`
   - Copy-to-note button for bot responses

4. **Suggested Actions** (`.vaultai-suggested-actions`)
   - Quick buttons: Summarize, Ask, Quiz, Translate
   - Hidden after first message

5. **Input Container** (`.chat-input-container`)
   - Textarea for user input
   - Action buttons: Custom Prompts, Mention (@), Insert, Send
   - Auto-send on Enter key

#### C. Chat History View
- Timeline-based organization: Today, Past 30 days, Older
- Search/filter functionality
- Delete chat sessions
- Click to restore previous sessions

---

## 2. AI PROVIDER INTEGRATION (Gemini)

### 2.1 GeminiService Implementation

**File:** `/home/user/VaultAI/src/services/GeminiService.ts`

```typescript
export class GeminiService {
    private model: any;
    private chat: any;

    constructor(apiKey: string) {
        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash"
        });
        this.startChat();
    }

    private startChat() {
        this.chat = this.model.startChat({
            history: [],
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });
    }

    async sendMessage(message: string): Promise<string>
    async summarizeContent(content: string): Promise<string>
    async translateContent(content: string, targetLanguage: string): Promise<string>
    async findActionItems(content: string): Promise<string>
}
```

**Current Capabilities:**
- `sendMessage()`: Chat conversation with context
- `summarizeContent()`: Summarize notes/content
- `translateContent()`: Translate to target language
- `findActionItems()`: Extract action items/tasks
- **Model**: `gemini-1.5-flash` (selected for speed/cost balance)
- **Max output tokens**: 1000

**Integration Points in Main Plugin:**
1. Service initialized in `onload()` with encrypted API key
2. Lazy loading on user input (via `handleMessage()`)
3. Error handling for: safety filters, rate limits, auth errors
4. Rate limiting: 1000ms cooldown between API calls
5. Context management: Max 30,000 character input limit

### 2.2 Message Flow
```
User Input
    ↓
Build Context (current file content, @referenced files, editor context)
    ↓
Truncate content if needed (MAX_CONTEXT_LENGTH = 30000)
    ↓
Send to GeminiService.sendMessage()
    ↓
Render response with markdown (MarkdownRenderer)
    ↓
Save to chat session history
    ↓
Optionally insert at cursor (if Insert Mode ON)
```

### 2.3 Error Handling
```typescript
Error types handled:
- SAFETY: Content safety violations
- BLOCKED: Blocked content
- 429/quota: Rate limit exceeded
- 400: Invalid request
- 401/403: Authentication failed
- 500: Server errors
```

---

## 3. FILE/NOTE HANDLING AND INDEXING MECHANISMS

### 3.1 File Access Methods

**Current Note Access:**
```typescript
// Get current active file
const activeFile = this.app.workspace.getActiveFile();

// Read file content
const content = await this.app.vault.read(activeFile);

// Update when file changes
this.registerEvent(
  this.app.workspace.on("active-leaf-change", async () => {
    this.currentFileContent = await this.app.vault.read(activeFile);
  })
);
```

**File Selection (via @mention):**
```typescript
// Modal to select from all markdown files
this.app.vault.getMarkdownFiles()

// Store referenced file content
this.referencedFiles: Map<string, string>
```

### 3.2 Content Context Building

**Editor Context Tracking:**
```typescript
this.editorContext = {
  fileName: string;
  lineContent: string;
  surroundingLines: string[];  // 3 lines before & after cursor
}

// Cursor position tracking
this.cursorPosition: { line: number; ch: number }

// Editor event listeners
this.registerEvent(
  this.app.workspace.on("editor-change", () => {
    this.updateEditorContext();
  })
);
```

**Context Inclusion in Prompts:**
```
--- Editor Context ---
File: {fileName}
Current line: {lineNumber}
Current line content: "{lineContent}"

Surrounding context:
```
{line numbers with marker for cursor}
```
--- End Context ---
```

### 3.3 Content Handling Limitations

**Current Indexing:** None (reads on-demand)
- No persistent index
- No vector embeddings
- No semantic search
- No document chunking

**Content Truncation:**
```typescript
private truncateContent(content: string): string {
  if (content.length <= MAX_CONTEXT_LENGTH) return content;
  
  // Breaks at paragraph boundaries
  const relevantPart = content.slice(0, MAX_CONTEXT_LENGTH);
  const lastParagraph = relevantPart.lastIndexOf("\n\n");
  return relevantPart.slice(0, lastParagraph) + 
         "\n\n[Content truncated for length...]";
}
```

**Potential for RAG Integration:**
- File references (@file syntax) only store in-memory
- No persistent knowledge base
- No cross-vault search
- Full file content always passed to API

---

## 4. API KEY MANAGEMENT AND SETTINGS

### 4.1 Encryption Implementation

**File:** `/home/user/VaultAI/main.ts` (lines 1489-1495)

```typescript
public encryptApiKey(key: string): string {
  return btoa(key.split("").reverse().join(""));  // Base64 + reverse
}

public decryptApiKey(encryptedKey: string): string {
  return atob(encryptedKey).split("").reverse().join("");
}
```

**Security Notes:**
- Basic obfuscation (Base64 + character reversal)
- NOT cryptographically secure
- Stored in Obsidian plugin data folder
- Obsidian handles disk encryption in some configurations

### 4.2 Settings Management

**Storage Location:** Obsidian vault data folder (plugin settings)

**Default Settings:**
```typescript
const DEFAULT_SETTINGS: GeminiChatbotSettings = {
  apiKey: "",
  floatingPosition: { x: 20, y: 20 },
  isDocked: false,
  chatSessions: [],
  customPrompts: [],
};
```

**Load/Save Methods:**
```typescript
async loadSettings() {
  this.settings = Object.assign(
    {},
    DEFAULT_SETTINGS,
    await this.loadData()  // Obsidian plugin API
  );
}

async saveSettings() {
  await this.saveData(this.settings);
}
```

### 4.3 Settings Tab Interface

**File:** `/home/user/VaultAI/main.ts` (lines 2465-2645)

**Class:** `GeminiChatbotSettingTab extends PluginSettingTab`

**Settings Available:**
1. **Gemini API Key**
   - Password input field (masked)
   - Show/hide toggle button
   - Decrypted on input change
   - Triggers `initializeGeminiService()`

2. **Custom Prompts Section**
   - Add/Edit/Delete prompts
   - Each prompt has: name, description, content
   - Supports placeholders: `{{selection}}`, `{{content}}`
   - Auto-registers commands for each prompt

**Settings Architecture:**
- Clean PluginSettingTab implementation
- Uses Obsidian Setting API for consistency
- Modal dialogs for add/edit prompts
- Real-time validation

---

## 5. MAIN ENTRY POINTS AND PLUGIN STRUCTURE

### 5.1 Entry Points

**Command Palette Commands:**
1. `open-vaultai-chat` - Opens chat
2. `toggle-vaultai-chat` - Toggles chat (Ctrl/Cmd+Shift+V)
3. `custom-prompt-{id}` - Custom prompts (dynamic)

**Editor Commands:**
1. `vaultai-generate-at-cursor` - Generate content at cursor
2. `vaultai-complete-line` - Complete current line
3. `vaultai-explain-selection` - Explain selected text
4. `vaultai-improve-selection` - Improve selected text

**UI Entry Points:**
- Chat icon click (bottom-right)
- @mention button → FileSelectionModal
- Custom prompts button → Dropdown menu
- History button → Chat history view
- More menu button → Options menu
- Suggested action buttons

### 5.2 Plugin Initialization Sequence

```
onload()
├── loadSettings()
├── initializeGeminiService() [if API key exists]
├── registerCommands() [7 commands]
├── registerEventListeners() [active-leaf-change, editor-change]
├── addSettingTab()
├── addFloatingIcon()
└── addChatContainer()
    ├── createChatHeader()
    ├── createBotInfo()
    ├── createMessagesContainer()
    ├── createSuggestedActions()
    ├── createInputContainer()
    ├── addChatEventListeners()
    └── addResizeFunctionality()
```

### 5.3 Modal Components

**CustomPromptModal** (`/home/user/VaultAI/src/modals/CustomPromptModal.ts`)
- Dialog for creating/editing custom prompts
- Fields: name, description, prompt content
- Placeholder helper text

**FileSelectionModal** (`/home/user/VaultAI/src/modals/FileSelectionModal.ts`)
- FuzzySuggestModal for vault file selection
- Shows file basename and path
- Returns selected file content

**LanguageSelectionModal** (`/home/user/VaultAI/src/modals/LanguageSelectionModal.ts`)
- Dropdown with 12 languages
- Used for translation feature

---

## 6. EXISTING SEARCH/RETRIEVAL FUNCTIONALITY

### 6.1 Current Search Capabilities

**Chat History Search:**
```typescript
private filterChatHistory(query: string) {
  const items = historyView.querySelectorAll(".history-item");
  items.forEach((item) => {
    const title = item.querySelector(".history-item-title")?.textContent?.toLowerCase();
    if (title.includes(query.toLowerCase())) {
      // Show item
    } else {
      // Hide item
    }
  });
}
```

**File Reference Search:**
```typescript
// Via @mention button → FileSelectionModal
// Fuzzy search on file names
this.app.vault.getMarkdownFiles()
```

### 6.2 Context Retrieval Mechanisms

**Active File Context:**
- Current file content automatically added to prompts
- Updated on file changes
- Truncated to MAX_CONTEXT_LENGTH

**Editor Context:**
- Cursor position tracking
- Surrounding lines (±3 lines from cursor)
- Current line content

**Referenced Files:**
- Manual @mention selection
- Content stored in-memory Map
- Cleared on new chat

### 6.3 Limitations of Current System

**No True Semantic Search:**
- Keyword/filename based only
- No embeddings
- No vector similarity

**No Persistent Knowledge Base:**
- In-memory only
- Lost on plugin reload
- No cross-session recall

**No Document Indexing:**
- Full file content always sent
- No chunking or summarization
- Wasted token usage on repetitive content

**No Cross-File Search:**
- Must manually reference files
- No automatic context discovery
- Linear file discovery

---

## 7. KEY CODE PATTERNS AND UTILITIES

### 7.1 Message Handling Flow
```typescript
handleMessage(message: string) {
  1. Check API cooldown
  2. Build context:
     - Extract @references from message
     - Get current file content
     - Get editor context (cursor + surrounding)
  3. Combine: context + user message
  4. Add user message to chat
  5. Show typing indicator
  6. Call geminiService.sendMessage()
  7. Render markdown response
  8. Save to session
  9. Optionally insert at cursor
  10. Update chat history
}
```

### 7.2 UI Rendering Utilities
```typescript
// Obsidian DOM API usage
createEl()        // Create elements
createSvg()       // Create SVG elements
createDiv()       // Create divs
createSvg()       // SVG factory
MarkdownRenderer  // Render markdown to HTML
```

### 7.3 Session Management
```typescript
// Session creation
createNewSession(): ChatSession {
  return {
    id: Date.now().toString(),
    title: "New chat",
    timestamp: Date.now(),
    messages: [],
  };
}

// Title generation based on first message
generateSessionTitle(firstMessage: string): string {
  // Pattern matching for: summarize, translate, questions
  // Keyword extraction for generic chat
  // Fallback to timestamp
}
```

---

## 8. ARCHITECTURE INSIGHTS FOR RAG INTEGRATION

### 8.1 Strengths

1. **Modular Service Design**
   - GeminiService is isolated and extensible
   - Easy to add new AI methods
   - Clean separation of concerns

2. **Comprehensive Settings**
   - Plugin already stores structured data
   - Chat history persistence implemented
   - Custom prompts framework exists

3. **Rich Editor Integration**
   - Cursor position tracking
   - Multi-level context awareness
   - Real-time file monitoring

4. **Flexible Message Building**
   - Context system is already in place
   - Easy to append additional context sources
   - Placeholder replacement pattern exists

5. **Event-Driven Architecture**
   - Obsidian event system well-utilized
   - Plugin lifecycle hooks available
   - Workspace monitoring established

### 8.2 Areas for RAG Enhancement

**File Indexing:**
- Need persistent index storage
- Could use Obsidian's datastore
- Incremental updates on file changes

**Vector Database:**
- Could use in-browser solutions (e.g., Wasm-based)
- Local storage for embeddings
- Batch processing for large vaults

**Gemini File Search API Integration Points:**
```
1. File Upload Handler
   - Pre-process vault files
   - Upload to Gemini File API
   - Store file IDs locally

2. Context Enhancement
   - Query File Search API
   - Append results to prompts
   - Blend with existing context

3. Multi-File Search
   - Search across uploaded files
   - Chunk long results
   - Rank by relevance
```

**Session-Level Context:**
- Store uploaded file IDs with chat sessions
- Reuse for multi-turn conversations
- Preserve context across chats

---

## 9. BUILD AND DEPLOYMENT

### 9.1 Build Configuration

**Esbuild Setup** (`esbuild.config.mjs`):
```
Entry: main.ts
Output: main.js (bundled)
Target: ES2018
Format: CommonJS
Tree-shaking: Enabled
Minification: Production only
```

**TypeScript Config** (`tsconfig.json`):
```
Target: ES6
Module: ESNext
Strict mode: Enabled
Source maps: Inline (dev only)
```

### 9.2 Npm Scripts
```
npm run dev      # Watch mode
npm run build    # Production build
npm run version  # Bump version
```

---

## 10. INTEGRATION POINTS FOR GEMINI FILE SEARCH API

### 10.1 Recommended Integration Approach

**1. Extend GeminiService**
```typescript
async uploadFile(filePath: string, content: string): Promise<string>
async searchFiles(query: string, fileIds: string[]): Promise<string>
async generateWithFileContext(message: string, fileIds: string[]): Promise<string>
```

**2. Add File Management**
- Track uploaded file IDs
- Store in plugin settings
- Delete when chats are archived

**3. Enhance Message Building**
- Query File Search API before sending
- Append search results to prompt
- Weight results by relevance

**4. Session Enhancement**
- Associate uploaded files with sessions
- Reuse files in multi-turn conversations
- Automatic cleanup

### 10.2 Data Structure Extensions

```typescript
interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  uploadedFileIds?: string[];  // NEW: Gemini File API IDs
}

interface GeminiChatbotSettings {
  apiKey: string;
  floatingPosition: { x: number; y: number };
  isDocked: boolean;
  chatSessions: ChatSession[];
  customPrompts: CustomPrompt[];
  fileSearchEnabled?: boolean;     // NEW
  maxContextFiles?: number;         // NEW
  enableAutoUpload?: boolean;       // NEW
}
```

---

## Summary

VaultAI is a well-structured Obsidian plugin with:
- Clean service-based architecture
- Comprehensive UI with floating chat interface
- Editor-aware context system
- Settings persistence and custom prompts
- Basic encryption for API keys
- Chat history management

**Key advantages for RAG implementation:**
- Extensible GeminiService
- Existing file access patterns
- Plugin data storage capabilities
- Event system for tracking changes
- Multi-level context building

**Primary integration points for Gemini File Search API:**
1. Extend GeminiService with file operations
2. Add file upload management
3. Enhance message context building
4. Store file IDs with sessions
5. Implement file search query integration

