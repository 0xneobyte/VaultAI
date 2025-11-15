# VaultAI Quick Reference Guide

## File Location Map

### Core Files
```
/home/user/VaultAI/
├── main.ts (2600+ lines)
│   ├── GeminiChatbotPlugin (main class)
│   └── GeminiChatbotSettingTab (settings UI)
├── src/services/GeminiService.ts (47 lines)
│   └── Service class for Gemini API calls
├── src/modals/
│   ├── CustomPromptModal.ts (134 lines)
│   ├── FileSelectionModal.ts (30 lines)
│   └── LanguageSelectionModal.ts (58 lines)
├── styles.css (600+ lines)
│   └── Chat UI styling
└── manifest.json
    └── Plugin metadata
```

## Core Data Structures

### Settings Storage
```typescript
GeminiChatbotSettings {
  apiKey: string (encrypted)
  floatingPosition: { x, y }
  isDocked: boolean
  chatSessions: ChatSession[]  // Persistent history
  customPrompts: CustomPrompt[]
}
```

### Chat Data
```typescript
ChatSession {
  id: string
  title: string
  timestamp: number
  messages: ChatMessage[]  // Conversation turns
}

ChatMessage {
  role: "user" | "bot"
  content: string
  timestamp: number
}
```

## Key Methods by Category

### Initialization & Lifecycle
| Method | Purpose | Line |
|--------|---------|------|
| `onload()` | Plugin startup | 71 |
| `onunload()` | Plugin cleanup | 1484 |
| `loadSettings()` | Load from disk | 1234 |
| `saveSettings()` | Persist to disk | 1242 |
| `initializeGeminiService()` | Create AI service | 175 |

### Chat UI
| Method | Purpose | Line |
|--------|---------|------|
| `toggleChatContainer()` | Show/hide chat | 1141 |
| `addChatContainer()` | Create chat UI | 659 |
| `createChatHeader()` | Build header | 700 |
| `createInputContainer()` | Build input area | 973 |
| `addChatEventListeners()` | Wire up buttons | 1023 |

### Message Handling
| Method | Purpose | Line |
|--------|---------|------|
| `handleMessage()` | Process user input | 345 |
| `addMessageToChat()` | Display in UI | 507 |
| `sendMessage()` | Call Gemini API | (in GeminiService) |
| `stripContextFromMessage()` | Hide internal context | 597 |

### Editor Integration
| Method | Purpose | Line |
|--------|---------|------|
| `updateEditorContext()` | Track cursor position | 1274 |
| `getEditorContextString()` | Format context info | 1309 |
| `insertAtCursor()` | Insert text at cursor | 1329 |
| `generateAtCursor()` | Generate at position | 1364 |
| `replaceSelection()` | Replace selected text | 1348 |

### Session Management
| Method | Purpose | Line |
|--------|---------|------|
| `createNewSession()` | Create chat session | 1653 |
| `generateSessionTitle()` | Auto-title chat | 1663 |
| `showChatHistoryView()` | Show past chats | 1805 |
| `deleteChat()` | Remove session | 1956 |
| `filterChatHistory()` | Search chats | 2096 |

### Settings
| Method | Purpose | Line |
|--------|---------|------|
| `encryptApiKey()` | Obfuscate API key | 1489 |
| `decryptApiKey()` | Reveal API key | 1493 |
| `displayCustomPrompts()` | Show prompts list | 2531 |
| `showAddPromptModal()` | Create new prompt | 2608 |
| `deletePrompt()` | Remove prompt | 2639 |

## Event Listeners

| Event | Trigger | Handler |
|-------|---------|---------|
| `active-leaf-change` | File switch | Update `currentFileContent` |
| `editor-change` | Text edit | Update `editorContext` |
| Button clicks | User action | Various chat methods |
| Keyboard (Enter) | Submit message | `handleMessage()` |
| Keyboard (Mod+Shift+V) | Toggle chat | `toggleChatContainer()` |

## Context Building Flow

```
User sends message
    ↓
Extract @references: /@([^\s]+)/g
    ↓
Get active file content (if no refs)
    ↓
Get editor context:
  - Current line number
  - Current line content
  - 3 lines before + 3 lines after cursor
    ↓
Format: context + "\n\nUser question: " + message
    ↓
Truncate to MAX_CONTEXT_LENGTH (30000)
    ↓
Send to GeminiService.sendMessage()
```

## UI Component Hierarchy

```
.gemini-chat-container (resizable, floating)
├── .gemini-chat-header
│   ├── .current-file (active file indicator)
│   └── .chat-header-controls
│       ├── .history-button
│       ├── .more-button
│       └── .close-button
├── .bot-info (intro screen)
│   ├── .bot-avatar
│   └── .bot-greeting
├── .vaultai-suggested-actions (quick start)
│   └── .vaultai-action-button (×4)
├── .gemini-chat-messages (scrollable)
│   └── .gemini-message-{role}
└── .chat-input-container
    ├── textarea.chat-input
    └── .input-actions
        ├── .prompts-button (✨)
        ├── .mention-button (@)
        ├── .insert-button (📍)
        └── .send-button (↑)
```

## Gemini Service API

```typescript
// Send message with context
await geminiService.sendMessage(
  "Current context...\n\nUser question: What does this mean?"
)

// Specialized functions
await geminiService.summarizeContent(text)
await geminiService.translateContent(text, language)
await geminiService.findActionItems(text)
```

**Model:** `gemini-1.5-flash`
**Max tokens:** 1000
**Cooldown:** 1000ms between requests
**Max context:** 30,000 characters

## Settings Tab Structure

```
Settings → VaultAI
├── Gemini API key (password field)
│   └── Show/hide toggle
└── Custom Prompts
    ├── List of existing prompts
    │   ├── Edit button
    │   └── Delete button
    └── Add Prompt button
        └── Opens CustomPromptModal
            ├── Name field
            ├── Description field
            ├── Prompt content (textarea)
            └── Placeholder reference
```

## Command Palette Commands

| Command | ID | Hotkey |
|---------|----|----|
| Open VaultAI Chat | `open-vaultai-chat` | - |
| Toggle VaultAI Chat | `toggle-vaultai-chat` | Ctrl/Cmd+Shift+V |
| Generate at cursor | `vaultai-generate-at-cursor` | - |
| Complete line | `vaultai-complete-line` | - |
| Explain selection | `vaultai-explain-selection` | - |
| Improve selection | `vaultai-improve-selection` | - |
| Custom Prompt: {name} | `custom-prompt-{id}` | - |

## Error Handling Strategy

```typescript
try {
  const response = await geminiService.sendMessage(message);
} catch (error) {
  // Error type detection:
  
  if (error.message.includes("SAFETY"))
    → Content safety violation
  
  if (error.message.includes("blocked") || "OTHER")
    → Blocked by content filters
  
  if (error.message.includes("429") || "quota")
    → Rate limit exceeded (cooldown: 1000ms)
  
  if (error.message.includes("400"))
    → Invalid request
  
  if (error.message.includes("401") || "403")
    → Auth failed (check API key)
  
  if (error.message.includes("500"))
    → Gemini service down
  
  // Show user-friendly error message
}
```

## Performance Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `API_COOLDOWN` | 1000ms | Prevent API spam |
| `MAX_CONTEXT_LENGTH` | 30000 | Keep under token limit |
| `DEFAULT_WIDTH` | 380px | Chat panel width |
| `DEFAULT_HEIGHT` | 590px | Chat panel height |
| `MIN_WIDTH` | 280px | Resizable minimum |
| `MAX_WIDTH` | 800px | Resizable maximum |

## Session Persistence

**Storage Location:** Obsidian plugin datastore
```
.obsidian/plugins/vault-ai/data.json
{
  "apiKey": "encrypted_string",
  "floatingPosition": { "x": 20, "y": 20 },
  "isDocked": false,
  "chatSessions": [...],
  "customPrompts": [...]
}
```

**Encryption:** Base64 + character reversal (NOT secure)
**Data Preserved:**
- Chat history (searchable by title)
- Custom prompts (with placeholders)
- API key (encrypted)
- UI position/size

## RAG Integration Checklist

For adding Gemini File Search API, consider:

- [ ] Extend GeminiService with `uploadFile()` method
- [ ] Add file upload handling to message flow
- [ ] Store Gemini file IDs in ChatSession
- [ ] Implement file search query integration
- [ ] Add settings for file search preferences
- [ ] Create file management UI (delete uploaded files)
- [ ] Implement automatic file cleanup
- [ ] Add progress indicator for uploads
- [ ] Handle file size limits
- [ ] Cache file IDs across sessions
- [ ] Implement file relevance ranking

## Key Patterns

### Placeholder Replacement
```typescript
customPrompt = customPrompt
  .replace(/\{\{selection\}\}/g, selectedText)
  .replace(/\{\{content\}\}/g, fileContent)
```

### File Reference Extraction
```typescript
const fileReferences = message.match(/@([^\s]+)/g)
// Returns: ["@file1", "@file2", ...]
```

### Content Truncation
```typescript
if (content.length > MAX_CONTEXT_LENGTH) {
  truncate at last paragraph break
  append "[Content truncated for length...]"
}
```

### CSS Custom Properties (Dynamic Sizing)
```css
--dynamic-width: 320px;
--dynamic-height: 480px;
```

## Testing Entry Points

1. **Chat flow:** Type in input → Send → Check response
2. **Context:** Check active file shown in header
3. **Editor integration:** Generate at cursor → Text inserted
4. **Custom prompts:** Create → Run from command palette
5. **File references:** Click @, select file → Content added
6. **Settings:** Update API key → Service reinitialized
7. **History:** Switch chats → Messages persist
8. **Resizing:** Drag chat corner → Size updates
9. **Full-page:** Click full-screen → CSS class toggles
10. **Errors:** Invalid API key → Error message shown

