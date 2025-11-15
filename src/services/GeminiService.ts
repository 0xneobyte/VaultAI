import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiService {
    private model: any;
    private chat: any;
    private genAI: GoogleGenerativeAI;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp"});
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

    async sendMessage(message: string, useRAG: boolean = false, fileSearchStoreName?: string): Promise<string> {
        try {
            if (useRAG && fileSearchStoreName) {
                // Use RAG-enabled query
                return await this.sendMessageWithRAG(message, fileSearchStoreName);
            }

            // Normal chat
            const result = await this.chat.sendMessage(message);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error sending message to Gemini:', error);
            throw error;
        }
    }

    async sendMessageWithRAG(message: string, fileSearchStoreName: string): Promise<string> {
        throw new Error("RAG functionality not yet available. The File Search API is coming soon. See RAG_IMPLEMENTATION_STATUS.md");

        // TODO: Uncomment when SDK is updated
        /*
        try {
            const response = await this.genAI.models.generateContent({
                model: "gemini-2.0-flash-exp",
                contents: message,
                config: {
                    tools: [
                        {
                            fileSearch: {
                                fileSearchStoreNames: [fileSearchStoreName]
                            }
                        }
                    ]
                }
            });

            // Extract citations if available
            const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
            let responseText = response.text();

            // Optionally append citation info
            if (groundingMetadata?.searchEntryPoint) {
                responseText += "\n\n---\n*Response grounded in your vault*";
            }

            return responseText;
        } catch (error) {
            console.error('Error sending RAG message:', error);
            throw error;
        }
        */
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