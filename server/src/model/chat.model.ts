import type { Db } from '../lib/db.js';

export type ChatRole = 'user' | 'assistant';

/** Record di `chat_conversation`. */
export interface IChatConversationRecord {
  id: number;
  user_id: number;
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Record di `chat_message`. */
export interface IChatMessageRecord {
  id: number;
  conversation_id: number;
  role: ChatRole;
  content: string;
  created_at: Date;
}

/** Conversazioni della chat, sempre filtrate per utente (sono private). */
export class ModelChat {
  constructor(private readonly db: Db) {}

  /** Ultime conversazioni dell'utente, dalla più recente. */
  listConversations(userId: number, limit: number): Promise<IChatConversationRecord[]> {
    return this.db.query<IChatConversationRecord>(
      `SELECT * FROM chat_conversation
        WHERE user_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT $2`,
      [userId, limit],
    );
  }

  findConversation(userId: number, id: number): Promise<IChatConversationRecord | null> {
    return this.db.queryOne<IChatConversationRecord>(
      'SELECT * FROM chat_conversation WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
  }

  async createConversation(userId: number): Promise<IChatConversationRecord> {
    const row = await this.db.queryOne<IChatConversationRecord>(
      'INSERT INTO chat_conversation (user_id) VALUES ($1) RETURNING *',
      [userId],
    );
    return row!;
  }

  async setTitle(id: number, title: string): Promise<void> {
    await this.db.execute('UPDATE chat_conversation SET title = $2 WHERE id = $1', [id, title]);
  }

  async deleteConversation(userId: number, id: number): Promise<boolean> {
    return (
      (await this.db.execute('DELETE FROM chat_conversation WHERE id = $1 AND user_id = $2', [
        id,
        userId,
      ])) > 0
    );
  }

  /** Messaggi della conversazione in ordine; con `limit` solo gli ultimi. */
  async messages(conversationId: number, limit?: number): Promise<IChatMessageRecord[]> {
    const rows = await this.db.query<IChatMessageRecord>(
      `SELECT * FROM chat_message
        WHERE conversation_id = $1
        ORDER BY id DESC
        ${limit ? 'LIMIT $2' : ''}`,
      limit ? [conversationId, limit] : [conversationId],
    );
    return rows.reverse();
  }

  /** Aggiunge un messaggio e aggiorna l'ultima attività della conversazione. */
  async addMessage(conversationId: number, role: ChatRole, content: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        'INSERT INTO chat_message (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversationId, role, content],
      );
      await tx.execute('UPDATE chat_conversation SET updated_at = now() WHERE id = $1', [
        conversationId,
      ]);
    });
  }
}
