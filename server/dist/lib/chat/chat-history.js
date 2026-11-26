import { notFound } from '../http-error.js';
/** Quante conversazioni mostra l'elenco. */
export const CHAT_LIST_LIMIT = 50;
/** Messaggi letti dal DB per ricostruire la storia (l'agente poi tiene gli ultimi configurati). */
const HISTORY_LIMIT = 50;
/**
 * Chat salvate per utente: ognuno vede e riprende solo le proprie. La storia della
 * conversazione la tiene il server; il client manda solo la nuova domanda.
 */
export class ChatHistoryService {
    model;
    constructor(model) {
        this.model = model;
    }
    async list(userId) {
        return (await this.model.listConversations(userId, CHAT_LIST_LIMIT)).map((c) => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updated_at.toISOString(),
        }));
    }
    async get(userId, id) {
        const conversation = await this.find(userId, id);
        const messages = await this.model.messages(conversation.id);
        return {
            id: conversation.id,
            title: conversation.title,
            messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
        };
    }
    async remove(userId, id) {
        if (!(await this.model.deleteConversation(userId, id)))
            throw notFound('Chat non trovata');
    }
    /** Salva la domanda (in una conversazione nuova se `conversationId` è null). */
    async startTurn(userId, conversationId, question) {
        const conversation = conversationId === null
            ? await this.model.createConversation(userId)
            : await this.find(userId, conversationId);
        await this.model.addMessage(conversation.id, 'user', question);
        const history = await this.model.messages(conversation.id, HISTORY_LIMIT);
        return {
            conversation,
            isNew: conversationId === null,
            history: history.map((m) => ({ role: m.role, content: m.content })),
        };
    }
    async saveReply(conversationId, content) {
        if (content.trim())
            await this.model.addMessage(conversationId, 'assistant', content);
    }
    async setTitle(conversationId, title) {
        await this.model.setTitle(conversationId, title);
    }
    async find(userId, id) {
        const conversation = await this.model.findConversation(userId, id);
        if (!conversation)
            throw notFound('Chat non trovata');
        return conversation;
    }
}
//# sourceMappingURL=chat-history.js.map