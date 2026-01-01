import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GroundingMetadata {
    webSearchQueries?: string[];
    groundingChunks?: Array<{
        web?: {
            uri: string;
            title?: string;
        };
    }>;
    groundingSupports?: Array<{
        segment?: {
            startIndex?: number;
            endIndex?: number;
        };
        groundingChunkIndices?: number[];
    }>;
}

export interface WebSearchResponse {
    text: string;
    groundingMetadata?: GroundingMetadata;
}

export class GeminiService {
    private model: any;
    private modelWithSearch: any;
    private chat: any;
    private genAI: GoogleGenerativeAI;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

        // Create a separate model instance for web search
        // Note: gemini-2.5-flash uses 'googleSearch' tool (not 'googleSearchRetrieval')
        // Using 'as any' because @google/generative-ai v0.24.1 types don't include the new googleSearch tool yet
        this.modelWithSearch = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{
                googleSearch: {}
            } as any]
        });

        this.startChat();
    }

    private startChat() {
        this.chat = this.model.startChat({
            history: [],
            generationConfig: {
                maxOutputTokens: 2000,
            },
        });
    }

    async sendMessage(message: string): Promise<string> {
        try {
            // Normal chat
            const result = await this.chat.sendMessage(message);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error sending message to Gemini:', error);
            throw error;
        }
    }

    async sendMessageWithWebSearch(message: string): Promise<WebSearchResponse> {
        try {
            const result = await this.modelWithSearch.generateContent(message);
            const response = await result.response;

            return {
                text: response.text(),
                groundingMetadata: response.candidates?.[0]?.groundingMetadata
            };
        } catch (error) {
            console.error('Error sending message to Gemini with web search:', error);
            throw error;
        }
    }

    async summarizeContent(content: string): Promise<string> {
        const prompt = `Please summarize the following content:\n\n${content}`;
        return this.sendMessage(prompt);
    }

    async translateContent(content: string, targetLanguage: string): Promise<string> {
        const prompt = `Please translate the following content to ${targetLanguage}:\n\n${content}`;
        return this.sendMessage(prompt);
    }

    async findActionItems(content: string): Promise<string> {
        const prompt = `Please analyze the following content and list all action items and tasks:\n\n${content}`;
        return this.sendMessage(prompt);
    }

    getApiKey(): string {
        return this.apiKey;
    }
} 