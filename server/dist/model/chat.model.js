/** Conversazioni della chat, sempre filtrate per utente (sono private). */
export class ModelChat {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Ultime conversazioni dell'utente, dalla più recente. */
    listConversations(userId, limit) {
        return this.db.query(`SELECT * FROM chat_conversation
        WHERE user_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT $2`, [userId, limit]);
    }
    findConversation(userId, id) {
        return this.db.queryOne('SELECT * FROM chat_conversation WHERE id = $1 AND user_id = $2', [id, userId]);
    }
    async createConversation(userId) {
        const row = await this.db.queryOne('INSERT INTO chat_conversation (user_id) VALUES ($1) RETURNING *', [userId]);
        return row;
    }
    async setTitle(id, title) {
        await this.db.execute('UPDATE chat_conversation SET title = $2 WHERE id = $1', [id, title]);
    }
    async deleteConversation(userId, id) {
        return ((await this.db.execute('DELETE FROM chat_conversation WHERE id = $1 AND user_id = $2', [
            id,
            userId,
        ])) > 0);
    }
    /** Messaggi della conversazione in ordine; con `limit` solo gli ultimi. */
    async messages(conversationId, limit) {
        const rows = await this.db.query(`SELECT * FROM chat_message
        WHERE conversation_id = $1
        ORDER BY id DESC
        ${limit ? 'LIMIT $2' : ''}`, limit ? [conversationId, limit] : [conversationId]);
        return rows.reverse();
    }
    /** Aggiunge un messaggio e aggiorna l'ultima attività della conversazione. */
    async addMessage(conversationId, role, content) {
        await this.db.transaction(async (tx) => {
            await tx.execute('INSERT INTO chat_message (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, role, content]);
            await tx.execute('UPDATE chat_conversation SET updated_at = now() WHERE id = $1', [
                conversationId,
            ]);
        });
    }
}
//# sourceMappingURL=chat.model.js.map