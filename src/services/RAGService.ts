import { GoogleGenAI } from "@google/genai";
import { TFile, Vault, Notice } from "obsidian";

// Note: crypto module needs to be imported from browser-compatible alternative
// Using Web Crypto API instead
declare const crypto: Crypto;

// Declare File Search Store types
// These APIs exist at runtime but are not yet in TypeScript definitions
interface FileSearchStoreConfig {
    displayName?: string;
}

interface FileSearchStore {
    name: string;
}

interface FileUploadConfig {
    displayName?: string;
    customMetadata?: Array<{
        key: string;
        stringValue?: string;
        numericValue?: number;
    }>;
}

interface Operation {
    done: boolean;
}

// Type for the additional File Search APIs that exist at runtime
interface FileSearchStoreAPI {
    create(params: { config: FileSearchStoreConfig }): Promise<FileSearchStore>;
    list(): AsyncIterable<FileSearchStore>;
    delete(params: { name: string; config?: { force: boolean } }): Promise<void>;
    uploadToFileSearchStore(params: {
        file: File;
        fileSearchStoreName: string;
        config?: FileUploadConfig;
    }): Promise<Operation>;
}

interface OperationsAPI {
    get(params: { operation: Operation }): Promise<Operation>;
}

interface ModelsAPI {
    generateContent(params: {
        model: string;
        contents: string;
        config: any;
    }): Promise<{ text: string; candidates?: any[] }>;
}

interface FileMetadata {
    path: string;
    hash: string;
    lastModified: number;
    uploaded: boolean;
    uploadedAt?: number;
}

interface SyncProgress {
    total: number;
    processed: number;
    current: string;
    status: "idle" | "syncing" | "completed" | "error";
}

export class RAGService {
    private genAI: GoogleGenAI & {
        fileSearchStores: FileSearchStoreAPI;
        operations: OperationsAPI;
        models: ModelsAPI;
    };
    private fileSearchStoreName: string | null = null;
    private syncedFiles: Map<string, FileMetadata> = new Map();
    private vault: Vault;

    // Progress tracking
    public syncProgress: SyncProgress = {
        total: 0,
        processed: 0,
        current: "",
        status: "idle"
    };

    constructor(apiKey: string, vault: Vault) {
        this.genAI = new GoogleGenAI({ apiKey: apiKey }) as any;
        this.vault = vault;
    }

    /**
     * Initialize or get existing File Search store
     */
    async initializeStore(storeName: string = "VaultAI-FileSearchStore"): Promise<string> {
        try {
            // Check if store already exists
            if (this.fileSearchStoreName) {
                return this.fileSearchStoreName;
            }

            // Create new File Search store
            const fileSearchStore = await this.genAI.fileSearchStores.create({
                config: { displayName: storeName }
            });

            this.fileSearchStoreName = fileSearchStore.name;
            console.log(`File Search store created: ${this.fileSearchStoreName}`);

            return this.fileSearchStoreName!;
        } catch (error: any) {
            console.error("Error initializing File Search store:", error);
            throw new Error(`Failed to initialize RAG store: ${error.message}`);
        }
    }

    /**
     * Get list of all File Search stores
     */
    async listStores(): Promise<any[]> {
        try {
            const stores = [];
            for await (const store of this.genAI.fileSearchStores.list()) {
                stores.push(store);
            }
            return stores;
        } catch (error: any) {
            console.error("Error listing stores:", error);
            return [];
        }
    }

    /**
     * Delete a File Search store
     */
    async deleteStore(storeName: string): Promise<void> {
        try {
            await this.genAI.fileSearchStores.delete({
                name: storeName,
                config: { force: true }
            });

            if (this.fileSearchStoreName === storeName) {
                this.fileSearchStoreName = null;
                this.syncedFiles.clear();
            }
        } catch (error: any) {
            console.error("Error deleting store:", error);
            throw new Error(`Failed to delete store: ${error.message}`);
        }
    }

    /**
     * Calculate hash for file content to detect changes
     */
    private async calculateHash(content: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    /**
     * Get all markdown files from vault or specific folder
     */
    private async getVaultFiles(folderPath?: string): Promise<TFile[]> {
        const allFiles = this.vault.getMarkdownFiles();

        if (!folderPath || folderPath === "/") {
            return allFiles;
        }

        // Filter files by folder path
        return allFiles.filter(file => file.path.startsWith(folderPath));
    }

    /**
     * Check which files need to be synced (new or modified)
     */
    async getFilesToSync(folderPath?: string): Promise<TFile[]> {
        const vaultFiles = await this.getVaultFiles(folderPath);
        const filesToSync: TFile[] = [];

        for (const file of vaultFiles) {
            const content = await this.vault.read(file);
            const currentHash = await this.calculateHash(content);
            const metadata = this.syncedFiles.get(file.path);

            // File needs sync if:
            // 1. Not previously uploaded, or
            // 2. Content has changed (different hash)
            if (!metadata || metadata.hash !== currentHash) {
                filesToSync.push(file);
            }
        }

        return filesToSync;
    }

    /**
     * Upload a single file to the File Search store
     */
    private async uploadFile(file: TFile): Promise<boolean> {
        try {
            if (!this.fileSearchStoreName) {
                await this.initializeStore();
            }

            const content = await this.vault.read(file);
            const hash = await this.calculateHash(content);

            // Create a temporary file buffer
            const blob = new Blob([content], { type: 'text/markdown' });
            const fileObject = new File([blob], file.name, { type: 'text/markdown' });

            // Upload directly to File Search store
            let operation = await this.genAI.fileSearchStores.uploadToFileSearchStore({
                file: fileObject,
                fileSearchStoreName: this.fileSearchStoreName!,
                config: {
                    displayName: file.name,
                    customMetadata: [
                        { key: "path", stringValue: file.path },
                        { key: "vault_file", stringValue: "true" },
                        { key: "last_modified", numericValue: file.stat.mtime }
                    ]
                }
            });

            // Wait for upload to complete
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes max

            while (!operation.done && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                operation = await this.genAI.operations.get({ operation });
                attempts++;
            }

            if (!operation.done) {
                throw new Error("Upload timeout");
            }

            // Update synced files tracking
            this.syncedFiles.set(file.path, {
                path: file.path,
                hash: hash,
                lastModified: file.stat.mtime,
                uploaded: true,
                uploadedAt: Date.now()
            });

            return true;
        } catch (error: any) {
            console.error(`Error uploading file ${file.path}:`, error);
            return false;
        }
    }

    /**
     * Sync vault files to File Search store
     */
    async syncVault(
        folderPath?: string,
        progressCallback?: (progress: SyncProgress) => void
    ): Promise<{ success: number; failed: number; skipped: number }> {
        this.syncProgress.status = "syncing";
        const filesToSync = await this.getFilesToSync(folderPath);

        this.syncProgress.total = filesToSync.length;
        this.syncProgress.processed = 0;

        let successCount = 0;
        let failedCount = 0;
        const skippedCount = (await this.getVaultFiles(folderPath)).length - filesToSync.length;

        if (filesToSync.length === 0) {
            this.syncProgress.status = "completed";
            new Notice("All files are already synced!");
            return { success: 0, failed: 0, skipped: skippedCount };
        }

        for (const file of filesToSync) {
            this.syncProgress.current = file.name;

            if (progressCallback) {
                progressCallback(this.syncProgress);
            }

            const success = await this.uploadFile(file);

            if (success) {
                successCount++;
            } else {
                failedCount++;
            }

            this.syncProgress.processed++;
        }

        this.syncProgress.status = "completed";
        this.syncProgress.current = "";

        if (progressCallback) {
            progressCallback(this.syncProgress);
        }

        return {
            success: successCount,
            failed: failedCount,
            skipped: skippedCount
        };
    }

    /**
     * Query the vault using RAG
     */
    async queryWithRAG(
        query: string,
        model: string = "gemini-2.5-flash",
        metadataFilter?: string
    ): Promise<{ text: string; citations?: any }> {
        try {
            if (!this.fileSearchStoreName) {
                throw new Error("No File Search store initialized. Please sync your vault first.");
            }

            const toolConfig: any = {
                tools: [
                    {
                        fileSearch: {
                            fileSearchStoreNames: [this.fileSearchStoreName]
                        }
                    }
                ]
            };

            // Add metadata filter if provided
            if (metadataFilter) {
                toolConfig.tools[0].fileSearch.metadataFilter = metadataFilter;
            }

            const response = await this.genAI.models.generateContent({
                model: model,
                contents: query,
                config: toolConfig
            });

            return {
                text: response.text || "",
                citations: response.candidates?.[0]?.groundingMetadata
            };
        } catch (error: any) {
            console.error("Error querying with RAG:", error);
            throw new Error(`RAG query failed: ${error.message}`);
        }
    }

    /**
     * Get sync statistics
     */
    getSyncStats(): { total: number; synced: number; pending: number } {
        const syncedCount = Array.from(this.syncedFiles.values()).filter(f => f.uploaded).length;

        return {
            total: this.syncedFiles.size,
            synced: syncedCount,
            pending: this.syncedFiles.size - syncedCount
        };
    }

    /**
     * Load synced files metadata from storage
     */
    loadSyncedFilesMetadata(metadata: Record<string, FileMetadata>): void {
        this.syncedFiles = new Map(Object.entries(metadata));
    }

    /**
     * Get synced files metadata for storage
     */
    getSyncedFilesMetadata(): Record<string, FileMetadata> {
        return Object.fromEntries(this.syncedFiles);
    }

    /**
     * Set the File Search store name (for loading from settings)
     */
    setFileSearchStoreName(name: string): void {
        this.fileSearchStoreName = name;
    }

    /**
     * Get the current File Search store name
     */
    getFileSearchStoreName(): string | null {
        return this.fileSearchStoreName;
    }
}
