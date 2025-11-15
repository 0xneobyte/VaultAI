# Gemini File Search RAG Implementation Plan for VaultAI

**Goal**: Transform VaultAI into a "Google Notebook LM" for Obsidian by enabling automatic RAG (Retrieval Augmented Generation) over the entire vault using Gemini's File Search API.

**Issue Reference**: #22 - Context confusion
**User Need**: Enable cross-vault AI capabilities for a 6K-note vault with automatic, trustable retrieval

---

## Executive Summary

This plan adds **fully automated RAG capabilities** to VaultAI by integrating Google's Gemini File Search API. Users will be able to:

1. **Index their entire vault** (or selected folders) into a File Search store
2. **Query across thousands of notes** automatically without manual @mentions
3. **Get cited, grounded responses** with references to specific notes
4. **Maintain indexed knowledge** that persists across sessions

**Complexity**: Medium (3-5 days of development)
**Breaking Changes**: None (fully backward compatible)
**New Dependencies**: Requires SDK upgrade from ^0.1.3 to latest

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Gemini File Search API Overview](#2-gemini-file-search-api-overview)
3. [Architecture Design](#3-architecture-design)
4. [Implementation Phases](#4-implementation-phases)
5. [Technical Specifications](#5-technical-specifications)
6. [User Experience Flow](#6-user-experience-flow)
7. [Cost & Performance Considerations](#7-cost--performance-considerations)
8. [Testing Strategy](#8-testing-strategy)
9. [Risks & Mitigation](#9-risks--mitigation)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Current State Analysis

### VaultAI Architecture (Current)

```typescript
// Current stack
SDK: @google/generative-ai ^0.1.3
Model: gemini-1.5-flash
Context: 30KB limit, manual file selection via @mentions
Storage: Chat sessions persisted, no file indexing
```

### Key Files to Modify

| File | Lines | Changes Required |
|------|-------|------------------|
| `package.json` | 34 | Update SDK to latest version |
| `src/services/GeminiService.ts` | 47 | Add File Search methods (~200 new lines) |
| `main.ts` | ~2600 | Add RAG integration (~300 new lines) |
| `styles.css` | - | Add indexing UI styles (~50 lines) |

### Current Capabilities (Keep)

✅ Floating chat interface
✅ Chat session history
✅ Custom prompts
✅ Editor integration
✅ File @mentions
✅ API key encryption

### Gaps (Fill with RAG)

❌ No automatic vault-wide context
❌ No semantic search
❌ No persistent knowledge indexing
❌ Manual file selection doesn't scale to 6K notes

---

## 2. Gemini File Search API Overview

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│  1. CREATE FILE SEARCH STORE                            │
│     └─→ Persistent container for embeddings             │
├─────────────────────────────────────────────────────────┤
│  2. UPLOAD & INDEX FILES                                │
│     └─→ Vault notes → Chunks → Embeddings → Index      │
├─────────────────────────────────────────────────────────┤
│  3. QUERY WITH FILE SEARCH                              │
│     User question → Semantic search → Relevant chunks   │
│     → Inject into prompt → Gemini generates answer      │
│     → Response includes citations                        │
└─────────────────────────────────────────────────────────┘
```

### Key Features

1. **Fully Managed RAG**: No need to manage embeddings, chunking, or vector databases manually
2. **Semantic Search**: Understanding meaning, not just keywords
3. **Automatic Citations**: Responses include which documents were used
4. **Custom Metadata**: Filter by tags, folders, date, etc.
5. **Persistent Storage**: Indexed data stays indefinitely (files expire in 48h)
6. **Configurable Chunking**: Control chunk size and overlap

### Supported Models (Need to Upgrade)

- ✅ `gemini-2.5-pro`
- ✅ `gemini-2.5-flash`
- ❌ `gemini-1.5-flash` (current) - **NOT SUPPORTED**

### Rate Limits & Pricing

| Item | Free Tier | Cost |
|------|-----------|------|
| Storage Limit | 1 GB | Free |
| Indexing | Unlimited | $0.15 / 1M tokens |
| Query Embeddings | Unlimited | Free |
| Retrieved Context | Included | Normal token pricing |

**For 6K notes (~6 MB of text):**
- Storage: ~18 MB (6 MB × 3 for embeddings) ✅ Well within 1 GB
- Initial Indexing Cost: ~$0.90 (assuming 6M tokens)
- Query Cost: Free embeddings, normal token rates

---

## 3. Architecture Design

### 3.1 Enhanced Data Structures

```typescript
// ============= NEW INTERFACES =============

interface FileSearchStore {
  name: string;                    // e.g., "fileSearchStores/abc123"
  displayName: string;             // e.g., "My Vault Knowledge Base"
  createTime: string;
  updateTime: string;
  documentCount?: number;
}

interface IndexedDocument {
  name: string;                    // Document ID in File Search store
  filePath: string;                // Original vault file path
  displayName: string;             // Note title
  indexedAt: number;               // Timestamp
  chunkCount?: number;
  metadata: {
    folder?: string;
    tags?: string[];
    modified?: number;
  };
}

interface IndexingJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  totalFiles: number;
  processedFiles: number;
  startTime: number;
  endTime?: number;
  errors: string[];
}

// ============= EXTENDED INTERFACES =============

interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
  fileSearchEnabled?: boolean;     // NEW: Use RAG for this session?
  fileSearchStoreName?: string;    // NEW: Which store to query
}

interface GeminiChatbotSettings {
  apiKey: string;
  floatingPosition: { x: number; y: number };
  isDocked: boolean;
  chatSessions: ChatSession[];
  customPrompts: CustomPrompt[];

  // ============= NEW RAG SETTINGS =============
  fileSearchStores: FileSearchStore[];     // User's File Search stores
  indexedDocuments: IndexedDocument[];     // Track what's indexed
  ragEnabled: boolean;                     // Master toggle
  defaultFileSearchStore?: string;         // Default store name
  autoReindexOnChange: boolean;            // Watch for file changes
  chunkingConfig: {
    maxTokensPerChunk: number;             // Default 500
    maxOverlapTokens: number;              // Default 50
  };
  indexingOptions: {
    includePatterns: string[];             // e.g., ["*.md"]
    excludePatterns: string[];             // e.g., ["templates/*"]
    includeFolders: string[];              // Specific folders only
  };
}
```

### 3.2 Extended GeminiService

```typescript
// src/services/GeminiService.ts

import { GoogleGenerativeAI, FileState } from "@google/generative-ai";

export class GeminiService {
  private model: any;
  private chat: any;
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash"  // UPGRADED
    });
    this.startChat();
  }

  // ============= EXISTING METHODS (keep) =============
  private startChat() { /* ... */ }
  async sendMessage(message: string): Promise<string> { /* ... */ }
  async summarizeContent(content: string): Promise<string> { /* ... */ }
  async translateContent(content: string, language: string): Promise<string> { /* ... */ }
  async findActionItems(content: string): Promise<string> { /* ... */ }

  // ============= NEW FILE SEARCH METHODS =============

  /**
   * Create a new File Search store for the vault
   */
  async createFileSearchStore(displayName: string): Promise<FileSearchStore> {
    const fileManager = this.genAI.fileManager;
    const store = await fileManager.createFileSearchStore({
      displayName: displayName
    });
    return {
      name: store.name,
      displayName: displayName,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    };
  }

  /**
   * List all File Search stores
   */
  async listFileSearchStores(): Promise<FileSearchStore[]> {
    const fileManager = this.genAI.fileManager;
    const stores = await fileManager.listFileSearchStores();
    return stores.fileSearchStores || [];
  }

  /**
   * Delete a File Search store
   */
  async deleteFileSearchStore(storeName: string): Promise<void> {
    const fileManager = this.genAI.fileManager;
    await fileManager.deleteFileSearchStore(storeName, { force: true });
  }

  /**
   * Upload a file directly to File Search store
   * @param filePath - Path to the file
   * @param fileContent - Content of the file
   * @param storeName - Name of the File Search store
   * @param metadata - Optional metadata (folder, tags, etc.)
   * @param chunkingConfig - Optional chunking configuration
   */
  async uploadToFileSearchStore(
    filePath: string,
    fileContent: string,
    storeName: string,
    metadata?: Record<string, any>,
    chunkingConfig?: { maxTokensPerChunk: number; maxOverlapTokens: number }
  ): Promise<IndexedDocument> {
    const fileManager = this.genAI.fileManager;

    // Create a temporary file blob
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const file = new File([blob], filePath.split('/').pop() || 'note.md');

    // Upload config
    const config: any = {
      displayName: filePath,
    };

    // Add custom metadata if provided
    if (metadata) {
      config.customMetadata = Object.entries(metadata).map(([key, value]) => {
        if (typeof value === 'number') {
          return { key, numericValue: value };
        } else if (Array.isArray(value)) {
          return { key, stringListValue: { values: value } };
        } else {
          return { key, stringValue: String(value) };
        }
      });
    }

    // Add chunking config if provided
    if (chunkingConfig) {
      config.chunkingConfig = {
        whiteSpaceConfig: {
          maxTokensPerChunk: chunkingConfig.maxTokensPerChunk,
          maxOverlapTokens: chunkingConfig.maxOverlapTokens
        }
      };
    }

    // Upload and import
    const operation = await fileManager.uploadToFileSearchStore({
      file: file,
      fileSearchStoreName: storeName,
      config: config
    });

    // Wait for completion (with timeout)
    const maxWait = 60000; // 60 seconds
    const startTime = Date.now();
    let currentOp = operation;

    while (!currentOp.done && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      currentOp = await fileManager.getOperation(currentOp.name);
    }

    if (!currentOp.done) {
      throw new Error(`Upload timeout for ${filePath}`);
    }

    return {
      name: currentOp.name,
      filePath: filePath,
      displayName: filePath.split('/').pop() || filePath,
      indexedAt: Date.now(),
      metadata: metadata || {}
    };
  }

  /**
   * Query with File Search enabled
   * @param message - User query
   * @param fileSearchStoreNames - Array of File Search store names to query
   * @param metadataFilter - Optional metadata filter (e.g., "folder:Projects")
   */
  async sendMessageWithFileSearch(
    message: string,
    fileSearchStoreNames: string[],
    metadataFilter?: string
  ): Promise<{ text: string; citations: any }> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash"
      });

      const toolConfig: any = {
        fileSearch: {
          fileSearchStoreNames: fileSearchStoreNames
        }
      };

      if (metadataFilter) {
        toolConfig.fileSearch.metadataFilter = metadataFilter;
      }

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: message }] }],
        tools: [toolConfig]
      });

      const response = result.response;
      const text = response.text();
      const citations = response.candidates?.[0]?.groundingMetadata || null;

      return { text, citations };
    } catch (error) {
      console.error('Error sending message with File Search:', error);
      throw error;
    }
  }

  /**
   * Batch upload multiple files
   */
  async batchUploadToFileSearchStore(
    files: Array<{ path: string; content: string; metadata?: any }>,
    storeName: string,
    chunkingConfig?: { maxTokensPerChunk: number; maxOverlapTokens: number },
    onProgress?: (current: number, total: number) => void
  ): Promise<IndexedDocument[]> {
    const results: IndexedDocument[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const doc = await this.uploadToFileSearchStore(
          files[i].path,
          files[i].content,
          storeName,
          files[i].metadata,
          chunkingConfig
        );
        results.push(doc);

        if (onProgress) {
          onProgress(i + 1, files.length);
        }
      } catch (error) {
        console.error(`Failed to upload ${files[i].path}:`, error);
        errors.push(`${files[i].path}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      console.warn(`Batch upload completed with ${errors.length} errors:`, errors);
    }

    return results;
  }
}
```

### 3.3 New UI Components

```
┌─────────────────────────────────────────────────────────┐
│  Settings Tab - NEW RAG SECTION                         │
├─────────────────────────────────────────────────────────┤
│  📚 File Search (RAG)                                   │
│                                                          │
│  [✓] Enable vault-wide RAG                              │
│                                                          │
│  File Search Store:                                     │
│  ┌──────────────────────────────────┐ [Create New]     │
│  │ My Vault Knowledge Base          │ [Manage]         │
│  └──────────────────────────────────┘                   │
│                                                          │
│  Status: ✅ 1,234 documents indexed                     │
│  Last updated: 2 hours ago                              │
│                                                          │
│  [Re-index Entire Vault] [Index Selected Folder]        │
│                                                          │
│  ▼ Advanced Options                                     │
│    Max tokens per chunk: [500]                          │
│    Overlap tokens: [50]                                 │
│    [ ] Auto re-index on file changes                    │
│                                                          │
│    Include patterns: *.md                               │
│    Exclude patterns: templates/*, .trash/*              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Indexing Modal (during vault indexing)                 │
├─────────────────────────────────────────────────────────┤
│  🔄 Indexing Your Vault...                              │
│                                                          │
│  ████████████░░░░░░░░░░  60% (600/1000 files)          │
│                                                          │
│  Current: Projects/AI/VaultAI.md                        │
│                                                          │
│  Elapsed: 2m 34s  |  Estimated: 1m 45s remaining        │
│                                                          │
│  ⚠️ 3 files failed (view log)                           │
│                                                          │
│  [Cancel] [Run in Background]                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Chat Interface - RAG Indicator                         │
├─────────────────────────────────────────────────────────┤
│  VaultAI  [⚙️] [━]                    [🔍 RAG: ON]      │
│  ─────────────────────────────────────────────────────  │
│  │ You: What did I write about RAG?                    │
│  │                                                      │
│  │ 🤖: Based on your notes, you wrote about RAG...    │
│  │     📄 Sources: Projects/AI.md, Research/RAG.md    │
│  │     [View Citations]                                │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Phases

### Phase 1: Foundation (Day 1) ⭐ CRITICAL

**Goal**: Upgrade SDK and prepare infrastructure

#### Tasks:
1. ✅ Upgrade `@google/generative-ai` from `^0.1.3` to latest
2. ✅ Update model from `gemini-1.5-flash` to `gemini-2.5-flash`
3. ✅ Add new interfaces to `main.ts`
4. ✅ Extend `DEFAULT_SETTINGS` with RAG defaults
5. ✅ Test basic File Search API connectivity

#### Files Modified:
- `package.json`
- `src/services/GeminiService.ts`
- `main.ts` (interfaces only)

#### Validation:
- [ ] Plugin loads without errors
- [ ] Existing chat functionality still works
- [ ] Can create a test File Search store

---

### Phase 2: Core RAG Service (Day 2) ⭐ CRITICAL

**Goal**: Implement File Search methods in GeminiService

#### Tasks:
1. ✅ Implement `createFileSearchStore()`
2. ✅ Implement `uploadToFileSearchStore()`
3. ✅ Implement `sendMessageWithFileSearch()`
4. ✅ Implement `batchUploadToFileSearchStore()`
5. ✅ Add error handling and retry logic
6. ✅ Add progress callbacks

#### Files Modified:
- `src/services/GeminiService.ts` (~200 new lines)

#### Validation:
- [ ] Can create File Search store
- [ ] Can upload single file
- [ ] Can query with File Search
- [ ] Batch upload works with progress
- [ ] Citations are returned

---

### Phase 3: Indexing Engine (Day 3)

**Goal**: Build vault indexing functionality

#### Tasks:
1. ✅ Create `VaultIndexer` class
   - Scan vault for markdown files
   - Filter by include/exclude patterns
   - Extract metadata (frontmatter, tags, folders)
   - Handle errors gracefully
2. ✅ Add indexing progress tracking
3. ✅ Implement incremental indexing (detect changes)
4. ✅ Add batch processing with rate limiting
5. ✅ Create indexing modal UI

#### New Files:
- `src/services/VaultIndexer.ts` (~300 lines)
- `src/modals/IndexingModal.ts` (~150 lines)

#### Validation:
- [ ] Can index entire vault
- [ ] Progress bar updates correctly
- [ ] Errors are logged and displayed
- [ ] Can cancel indexing
- [ ] Incremental indexing detects changes

---

### Phase 4: Settings UI (Day 4)

**Goal**: Add RAG configuration to settings

#### Tasks:
1. ✅ Add RAG section to settings tab
2. ✅ File Search store management UI
   - Create new store
   - Select existing store
   - Delete store (with confirmation)
3. ✅ Indexing controls
   - "Index Entire Vault" button
   - "Index Selected Folder" button
   - Progress indicator
4. ✅ Advanced settings
   - Chunking configuration
   - Include/exclude patterns
   - Auto re-index toggle

#### Files Modified:
- `main.ts` (settings tab section, ~200 new lines)
- `styles.css` (~50 new lines)

#### Validation:
- [ ] Settings UI renders correctly
- [ ] Can create/delete stores
- [ ] Indexing buttons work
- [ ] Settings persist

---

### Phase 5: Chat Integration (Day 5)

**Goal**: Wire RAG into chat flow

#### Tasks:
1. ✅ Add RAG toggle to chat header
2. ✅ Modify `sendMessage()` to use File Search when enabled
3. ✅ Display citations in chat
4. ✅ Add "View Sources" functionality
5. ✅ Handle fallback when RAG is disabled
6. ✅ Add per-session RAG toggle

#### Files Modified:
- `main.ts` (chat methods, ~100 new lines)
- `styles.css` (citation styles, ~30 lines)

#### Validation:
- [ ] RAG toggle works in chat
- [ ] Citations are displayed
- [ ] Can view source documents
- [ ] Works with/without RAG
- [ ] Per-session settings work

---

### Phase 6: Polish & Optimization (Day 6)

**Goal**: Refine UX and performance

#### Tasks:
1. ✅ Add loading states and animations
2. ✅ Implement background indexing
3. ✅ Add file change watcher (optional auto-reindex)
4. ✅ Optimize chunking config for Obsidian notes
5. ✅ Add usage statistics (documents indexed, tokens used)
6. ✅ Error messaging improvements
7. ✅ Add help tooltips

#### Files Modified:
- All files (refinements)
- Add `README_RAG.md` documentation

#### Validation:
- [ ] UX feels polished
- [ ] No performance issues with large vaults
- [ ] Error messages are helpful
- [ ] Documentation is complete

---

## 5. Technical Specifications

### 5.1 VaultIndexer Service

```typescript
// src/services/VaultIndexer.ts

import { Vault, TFile, Notice } from "obsidian";
import { GeminiService } from "./GeminiService";

export interface IndexingOptions {
  includePatterns: string[];      // e.g., ["*.md"]
  excludePatterns: string[];      // e.g., ["templates/*", ".trash/*"]
  includeFolders?: string[];      // Specific folders only
  chunkingConfig: {
    maxTokensPerChunk: number;
    maxOverlapTokens: number;
  };
}

export interface IndexingProgress {
  current: number;
  total: number;
  currentFile: string;
  status: "running" | "completed" | "failed" | "cancelled";
  errors: Array<{ file: string; error: string }>;
}

export class VaultIndexer {
  private vault: Vault;
  private geminiService: GeminiService;
  private cancelled = false;

  constructor(vault: Vault, geminiService: GeminiService) {
    this.vault = vault;
    this.geminiService = geminiService;
  }

  /**
   * Scan vault and get files matching patterns
   */
  async scanVault(options: IndexingOptions): Promise<TFile[]> {
    const allFiles = this.vault.getMarkdownFiles();
    const filtered: TFile[] = [];

    for (const file of allFiles) {
      // Check include patterns
      const matchesInclude = options.includePatterns.some(pattern =>
        this.matchesPattern(file.path, pattern)
      );

      // Check exclude patterns
      const matchesExclude = options.excludePatterns.some(pattern =>
        this.matchesPattern(file.path, pattern)
      );

      // Check folder restrictions
      const inIncludedFolder = !options.includeFolders ||
        options.includeFolders.length === 0 ||
        options.includeFolders.some(folder => file.path.startsWith(folder));

      if (matchesInclude && !matchesExclude && inIncludedFolder) {
        filtered.push(file);
      }
    }

    return filtered;
  }

  /**
   * Index entire vault or filtered files
   */
  async indexVault(
    fileSearchStoreName: string,
    options: IndexingOptions,
    onProgress?: (progress: IndexingProgress) => void
  ): Promise<IndexedDocument[]> {
    this.cancelled = false;
    const files = await this.scanVault(options);
    const total = files.length;
    const results: IndexedDocument[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    new Notice(`Starting indexing of ${total} files...`);

    for (let i = 0; i < files.length; i++) {
      if (this.cancelled) {
        if (onProgress) {
          onProgress({
            current: i,
            total,
            currentFile: "",
            status: "cancelled",
            errors
          });
        }
        throw new Error("Indexing cancelled by user");
      }

      const file = files[i];

      try {
        // Read file content
        const content = await this.vault.read(file);

        // Extract metadata from frontmatter
        const metadata = this.extractMetadata(file, content);

        // Upload to File Search
        const doc = await this.geminiService.uploadToFileSearchStore(
          file.path,
          content,
          fileSearchStoreName,
          metadata,
          options.chunkingConfig
        );

        results.push(doc);

        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            currentFile: file.path,
            status: "running",
            errors
          });
        }

        // Rate limiting: small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Failed to index ${file.path}:`, error);
        errors.push({ file: file.path, error: error.message });
      }
    }

    if (onProgress) {
      onProgress({
        current: total,
        total,
        currentFile: "",
        status: errors.length > 0 ? "failed" : "completed",
        errors
      });
    }

    new Notice(`Indexing complete: ${results.length}/${total} files indexed`);

    return results;
  }

  /**
   * Cancel ongoing indexing
   */
  cancel() {
    this.cancelled = true;
  }

  /**
   * Extract metadata from file
   */
  private extractMetadata(file: TFile, content: string): Record<string, any> {
    const metadata: Record<string, any> = {
      folder: file.parent?.path || "/",
      modified: file.stat.mtime,
      created: file.stat.ctime,
      size: file.stat.size
    };

    // Extract frontmatter tags
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const frontmatter = match[1];
      const tagsMatch = frontmatter.match(/tags:\s*\[(.*?)\]/);

      if (tagsMatch) {
        metadata.tags = tagsMatch[1].split(',').map(t => t.trim());
      }
    }

    // Extract inline tags
    const inlineTags = content.match(/#[\w-]+/g);
    if (inlineTags) {
      metadata.inlineTags = inlineTags.map(t => t.substring(1));
    }

    return metadata;
  }

  /**
   * Simple glob pattern matching
   */
  private matchesPattern(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    return new RegExp(`^${regexPattern}$`).test(path);
  }
}
```

### 5.2 Indexing Modal

```typescript
// src/modals/IndexingModal.ts

import { Modal, App } from "obsidian";
import { IndexingProgress } from "../services/VaultIndexer";

export class IndexingModal extends Modal {
  private progress: IndexingProgress;
  private onCancel: () => void;
  private progressBar: HTMLElement;
  private statusText: HTMLElement;

  constructor(app: App, onCancel: () => void) {
    super(app);
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vaultai-indexing-modal");

    // Title
    contentEl.createEl("h2", { text: "🔄 Indexing Your Vault..." });

    // Progress bar container
    const progressContainer = contentEl.createDiv("progress-container");
    this.progressBar = progressContainer.createDiv("progress-bar");

    // Status text
    this.statusText = contentEl.createEl("p", { cls: "status-text" });

    // Current file
    const currentFileEl = contentEl.createEl("p", { cls: "current-file" });
    currentFileEl.textContent = "Preparing...";

    // Buttons
    const buttonContainer = contentEl.createDiv("button-container");

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => {
      this.onCancel();
      this.close();
    };

    const backgroundBtn = buttonContainer.createEl("button", {
      text: "Run in Background"
    });
    backgroundBtn.onclick = () => {
      this.close();
      // Continue indexing in background
    };
  }

  updateProgress(progress: IndexingProgress) {
    this.progress = progress;

    // Update progress bar
    const percentage = (progress.current / progress.total) * 100;
    this.progressBar.style.width = `${percentage}%`;

    // Update status text
    this.statusText.textContent =
      `${progress.current}/${progress.total} files (${Math.round(percentage)}%)`;

    // Update current file
    const currentFileEl = this.contentEl.querySelector(".current-file");
    if (currentFileEl && progress.currentFile) {
      currentFileEl.textContent = `Current: ${progress.currentFile}`;
    }

    // Show errors if any
    if (progress.errors.length > 0) {
      const errorEl = this.contentEl.querySelector(".error-summary") ||
        this.contentEl.createDiv("error-summary");
      errorEl.textContent = `⚠️ ${progress.errors.length} files failed`;
    }

    // Auto-close on completion
    if (progress.status === "completed") {
      setTimeout(() => this.close(), 2000);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

---

## 6. User Experience Flow

### 6.1 First-Time Setup

```
1. User installs VaultAI
2. User enters Gemini API key in settings
3. User sees new "File Search (RAG)" section
4. User clicks "Enable vault-wide RAG" toggle
5. Modal appears: "Setup File Search"
   - "Create a File Search store to enable RAG"
   - Input: Store name (default: "My Vault Knowledge Base")
   - [Create Store]
6. Store created successfully
7. Modal: "Index your vault now?"
   - "We'll index 1,234 markdown files"
   - Estimated time: ~10 minutes
   - Cost: ~$0.50 for initial indexing
   - [Index Now] [Skip - I'll do it later]
8. If "Index Now": Indexing modal shows progress
9. Indexing completes: "✅ Ready! You can now ask questions about your entire vault."
```

### 6.2 Daily Usage

```
USER OPENS CHAT
  ↓
Chat header shows: [🔍 RAG: ON]
  ↓
USER TYPES: "What did I write about machine learning?"
  ↓
VaultAI:
  1. Queries File Search store
  2. Retrieves relevant chunks from notes
  3. Sends to Gemini with retrieved context
  4. Gemini generates answer
  5. Response includes citations
  ↓
RESPONSE SHOWN:
  "Based on your notes, you wrote about ML in several places:
   - Neural networks in 'AI Fundamentals.md'
   - Practical applications in 'Projects/ML.md'
   - Recent research in 'Research/2025-01.md'

   [📄 View Sources]"
  ↓
USER CLICKS "View Sources"
  ↓
Modal shows:
  - AI Fundamentals.md (lines 45-67)
  - Projects/ML.md (lines 12-34)
  - Research/2025-01.md (lines 89-103)
  [Open in Obsidian]
```

### 6.3 Incremental Updates

```
USER CREATES NEW NOTE: "AI Research 2025.md"
  ↓
If auto-reindex enabled:
  1. File watcher detects change
  2. Background: Upload new file to File Search store
  3. Notification: "✅ New note indexed"
  ↓
If auto-reindex disabled:
  1. Settings shows: "⚠️ 15 new/modified files since last index"
  2. [Re-index Now]
```

---

## 7. Cost & Performance Considerations

### 7.1 Cost Estimation

**For a 6,000-note vault:**

| Item | Calculation | Cost |
|------|-------------|------|
| Average note size | 1 KB | - |
| Total vault size | 6 MB | - |
| Estimated tokens | ~1.5M words × 1.3 = 2M tokens | - |
| Initial indexing | 2M tokens × $0.15/1M | **$0.30** |
| Storage (embeddings) | 18 MB (free up to 1 GB) | **$0** |
| Query embeddings | Unlimited | **$0** |
| Retrieved context | ~2K tokens/query × 100 queries/month | ~$0.02 |
| **Monthly total** | One-time $0.30 + $0.02/month | **~$0.02/month** |

**Incremental updates:**
- Add 10 new notes/day: ~$0.002/day = $0.06/month
- **Total monthly cost: ~$0.08/month** 🎉

### 7.2 Performance Considerations

**Indexing Speed:**
- Upload rate: ~5-10 files/second
- 6,000 files: ~10-20 minutes
- Can run in background

**Query Speed:**
- File Search lookup: ~200-500ms
- Gemini response: ~1-3 seconds
- **Total: ~2-4 seconds** (comparable to current chat)

**Storage:**
- Raw files in File API: 6 MB (deleted after 48h)
- File Search embeddings: ~18 MB (3× multiplier)
- Local settings: ~2-5 MB (tracking indexed files)
- **Total: ~20-25 MB**

### 7.3 Optimization Strategies

1. **Chunking Optimization**
   - Default: 500 tokens/chunk, 50 overlap
   - For Obsidian: Increase to 800/100 for better context
   - Reduces total chunks = faster queries

2. **Selective Indexing**
   - Exclude templates, daily notes if not needed
   - Use folder filters for project-specific stores
   - Reduces indexing time and cost

3. **Batch Processing**
   - Upload in parallel (5-10 concurrent)
   - Use exponential backoff for rate limits
   - Show progress to user

4. **Incremental Updates**
   - Only re-index changed files
   - Track file modification timestamps
   - Background processing

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// Test GeminiService RAG methods

describe("GeminiService File Search", () => {
  test("createFileSearchStore creates store", async () => {
    const store = await geminiService.createFileSearchStore("Test Store");
    expect(store.name).toContain("fileSearchStores/");
  });

  test("uploadToFileSearchStore uploads file", async () => {
    const doc = await geminiService.uploadToFileSearchStore(
      "test.md",
      "Test content",
      storeName
    );
    expect(doc.filePath).toBe("test.md");
  });

  test("sendMessageWithFileSearch returns citations", async () => {
    const result = await geminiService.sendMessageWithFileSearch(
      "What is this about?",
      [storeName]
    );
    expect(result.text).toBeTruthy();
    expect(result.citations).toBeTruthy();
  });
});
```

### 8.2 Integration Tests

```typescript
// Test VaultIndexer

describe("VaultIndexer", () => {
  test("scanVault filters files correctly", async () => {
    const files = await indexer.scanVault({
      includePatterns: ["*.md"],
      excludePatterns: ["templates/*"],
      chunkingConfig: { maxTokensPerChunk: 500, maxOverlapTokens: 50 }
    });
    expect(files.every(f => f.path.endsWith(".md"))).toBe(true);
    expect(files.every(f => !f.path.startsWith("templates/"))).toBe(true);
  });

  test("indexVault processes all files", async () => {
    const docs = await indexer.indexVault(storeName, options);
    expect(docs.length).toBeGreaterThan(0);
  });
});
```

### 8.3 Manual Testing Checklist

- [ ] Create File Search store in settings
- [ ] Index small vault (10 files)
- [ ] Query indexed vault in chat
- [ ] Verify citations appear
- [ ] Click "View Sources" and verify correct files shown
- [ ] Toggle RAG on/off in chat
- [ ] Create new file and re-index
- [ ] Test with large vault (1000+ files)
- [ ] Test error handling (invalid API key, network error)
- [ ] Test cancelling indexing mid-way
- [ ] Delete File Search store
- [ ] Verify settings persist across restarts

---

## 9. Risks & Mitigation

### 9.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| SDK breaking changes | High | Medium | Pin SDK version, test thoroughly |
| API rate limits | Medium | Low | Implement exponential backoff, batch processing |
| Large vault indexing timeout | Medium | Medium | Background processing, resumable indexing |
| File Search store quota exceeded | High | Low | Show usage stats, warn before limit |
| Citations not working | Medium | Low | Fallback to non-RAG mode, log errors |

### 9.2 User Experience Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Users don't understand RAG | Medium | High | Clear onboarding, tooltips, documentation |
| Indexing takes too long | Medium | Medium | Background processing, progress indicators |
| Costs surprise users | High | Low | Show cost estimates upfront, usage tracking |
| RAG gives wrong answers | High | Medium | Show citations, allow disabling RAG |
| Settings too complex | Medium | Medium | Sensible defaults, progressive disclosure |

### 9.3 Data Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Private notes uploaded to Google | Critical | N/A | Clearly document this in settings |
| File Search store not deleted | Low | Medium | Provide easy deletion, warn on uninstall |
| Sync conflicts with indexed data | Low | Low | Store settings in plugin folder |

---

## 10. Future Enhancements

### Phase 7+ (Post-MVP)

1. **Multi-Store Support**
   - Create separate stores per project/folder
   - Switch stores per chat session
   - Merge results from multiple stores

2. **Advanced Metadata Filtering**
   - Filter by date range: "Notes from last month"
   - Filter by tags: "Only #project notes"
   - Filter by folder: "Just my work notes"

3. **Smart Chunking**
   - Respect heading boundaries
   - Keep bullet lists together
   - Preserve code blocks

4. **Citation Enhancements**
   - Click citation to jump to note
   - Highlight relevant sections
   - Show snippet previews

5. **Usage Analytics**
   - Track queries per day
   - Show most-cited notes
   - Token usage dashboard

6. **Incremental Indexing Improvements**
   - File watcher for auto-reindex
   - Detect moved/renamed files
   - Smart batching of updates

7. **Export/Import Stores**
   - Backup File Search stores
   - Share stores with team
   - Version control integration

8. **Query Optimization**
   - Query history and suggestions
   - "Related notes" sidebar
   - Auto-suggest follow-up questions

---

## Summary & Next Steps

### ✅ This Plan Delivers

1. **Full RAG capabilities** for 6K-note vaults
2. **Automatic semantic search** across all notes
3. **Cited, grounded responses** with source tracking
4. **Backward compatible** - existing features unchanged
5. **Cost-effective** - ~$0.30 one-time + $0.08/month
6. **User-friendly** - clear UI, progress tracking, error handling

### 📋 Implementation Checklist

- [ ] Phase 1: Foundation (SDK upgrade, interfaces)
- [ ] Phase 2: Core RAG Service (GeminiService methods)
- [ ] Phase 3: Indexing Engine (VaultIndexer)
- [ ] Phase 4: Settings UI (RAG configuration)
- [ ] Phase 5: Chat Integration (wire RAG into chat)
- [ ] Phase 6: Polish & Optimization (UX, docs)

### 🚀 Ready to Start?

**Recommended approach:**
1. Review this plan with stakeholders
2. Start with Phase 1 (foundation) - low risk, validates SDK
3. Build incrementally, test each phase
4. Gather user feedback after Phase 5 (MVP)
5. Iterate based on usage data

**Estimated timeline:** 5-6 days of focused development

**Risk level:** Medium (new API, but well-documented)

**Value:** High (transforms VaultAI into "Notebook LM for Obsidian")

---

**Questions? Concerns? Suggestions?**

This is a living document. Please provide feedback before we begin implementation!
