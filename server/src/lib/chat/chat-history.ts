import type { ChatRole, IChatConversationRecord, ModelChat } from '../../model/chat.model.js';
import { notFound } from '../http-error.js';

/** Contratto con il client (stessi tipi in `client/src/app/core/api/chats-api.ts`). */
export interface ChatSummaryDto {
  id: number;
  /** `null` finché l'AI non ha generato il titolo. */
  title: string | null;
  /** Ultima attività. */
  updatedAt: string;
}

export interface ChatMessageDto {
  id: number;
  role: ChatRole;
  content: string;
}

export interface ChatDto {
  id: number;
  title: string | null;
  messages: ChatMessageDto[];
}

/** Quante conversazioni mostra l'elenco. */
export const CHAT_LIST_LIMIT = 50;
/** Messaggi letti dal DB per ricostruire la storia (l'agente poi tiene gli ultimi configurati). */
const HISTORY_LIMIT = 50;

/** Domanda in arrivo, già salvata: conversazione e storia da mandare al modello. */
export interface StartedTurn {
  conversation: IChatConversationRecord;
  /** `true` se la conversazione è appena stata creata (serve il titolo). */
  isNew: boolean;
  history: { role: ChatRole; content: string }[];
}

/**
 * Chat salvate per utente: ognuno vede e riprende solo le proprie. La storia della
 * conversazione la tiene il server; il client manda solo la nuova domanda.
 */
export class ChatHistoryService {
  constructor(private readonly model: ModelChat) {}

  async list(userId: number): Promise<ChatSummaryDto[]> {
    return (await this.model.listConversations(userId, CHAT_LIST_LIMIT)).map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at.toISOString(),
    }));
  }

  async get(userId: number, id: number): Promise<ChatDto> {
    const conversation = await this.find(userId, id);
    const messages = await this.model.messages(conversation.id);
    return {
      id: conversation.id,
      title: conversation.title,
      messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    };
  }

  async remove(userId: number, id: number): Promise<void> {
    if (!(await this.model.deleteConversation(userId, id))) throw notFound('Chat non trovata');
  }

  /** Salva la domanda (in una conversazione nuova se `conversationId` è null). */
  async startTurn(userId: number, conversationId: number | null, question: string): Promise<StartedTurn> {
    const conversation =
      conversationId === null
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

  async saveReply(conversationId: number, content: string): Promise<void> {
    if (content.trim()) await this.model.addMessage(conversationId, 'assistant', content);
  }

  async setTitle(conversationId: number, title: string): Promise<void> {
    await this.model.setTitle(conversationId, title);
  }

  private async find(userId: number, id: number): Promise<IChatConversationRecord> {
    const conversation = await this.model.findConversation(userId, id);
    if (!conversation) throw notFound('Chat non trovata');
    return conversation;
  }
}
