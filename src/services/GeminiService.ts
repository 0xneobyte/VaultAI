import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiService {
    private model: any;
    private chat: any;

    constructor(apiKey: string) {
        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({ model: "gemini-pro" });
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

    async sendMessage(message: string): Promise<string> {
        try {
            const result = await this.chat.sendMessage(message);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error sending message to Gemini:', error);
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
} 