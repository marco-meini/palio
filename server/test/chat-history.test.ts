import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChatHistoryService } from '../src/lib/chat/chat-history.js';
import { cleanTitle, fallbackTitle } from '../src/lib/chat/chat-title.js';
import { HttpError } from '../src/lib/http-error.js';
import type { ChatRole, IChatConversationRecord, IChatMessageRecord, ModelChat } from '../src/model/chat.model.js';

describe('titolo della chat', () => {
  it('ripulisce la risposta del modello', () => {
    assert.equal(cleanTitle('"Vittorie dell\'Aquila negli anni \'90."'), "Vittorie dell'Aquila negli anni '90");
    assert.equal(cleanTitle('Titolo: Cavalli in palii consecutivi\n\naltro'), 'Cavalli in palii consecutivi');
    assert.equal(cleanTitle('**«Fantini vincenti»**'), 'Fantini vincenti');
    assert.equal(cleanTitle('   \n '), null);
    assert.equal(cleanTitle('x'.repeat(200))!.length, 80);
  });
  it('di riserva: l’inizio della domanda', () => {
    assert.equal(fallbackTitle('Chi ha vinto nel 2025?'), 'Chi ha vinto nel 2025?');
    assert.ok(fallbackTitle('a'.repeat(100)).endsWith('…'));
  });
});

/** Model in memoria: conversazioni di più utenti. */
function fakeModel() {
  const conversations: IChatConversationRecord[] = [];
  const messages: IChatMessageRecord[] = [];
  let seq = 1;
  const model = {
    async listConversations(userId: number, limit: number) {
      return conversations
        .filter((c) => c.user_id === userId)
        .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime() || b.id - a.id)
        .slice(0, limit);
    },
    async findConversation(userId: number, id: number) {
      return conversations.find((c) => c.id === id && c.user_id === userId) ?? null;
    },
    async createConversation(userId: number) {
      const c = { id: seq++, user_id: userId, title: null, created_at: new Date(), updated_at: new Date() };
      conversations.push(c);
      return c;
    },
    async setTitle(id: number, title: string) {
      conversations.find((c) => c.id === id)!.title = title;
    },
    async deleteConversation(userId: number, id: number) {
      const i = conversations.findIndex((c) => c.id === id && c.user_id === userId);
      if (i < 0) return false;
      conversations.splice(i, 1);
      return true;
    },
    async messages(conversationId: number, limit?: number) {
      const list = messages.filter((m) => m.conversation_id === conversationId);
      return limit ? list.slice(-limit) : list;
    },
    async addMessage(conversationId: number, role: ChatRole, content: string) {
      messages.push({ id: seq++, conversation_id: conversationId, role, content, created_at: new Date() });
      conversations.find((c) => c.id === conversationId)!.updated_at = new Date(Date.now() + seq);
    },
  };
  return { service: new ChatHistoryService(model as unknown as ModelChat), conversations, messages };
}

const notFound = (e: unknown) => e instanceof HttpError && e.status === 404;

describe('ChatHistoryService', () => {
  it('nuova chat: crea la conversazione e salva la domanda', async () => {
    const { service } = fakeModel();
    const turn = await service.startTurn(1, null, 'Chi ha vinto?');
    assert.equal(turn.isNew, true);
    assert.deepEqual(turn.history, [{ role: 'user', content: 'Chi ha vinto?' }]);
  });

  it('chat esistente: la storia comprende le risposte precedenti', async () => {
    const { service } = fakeModel();
    const first = await service.startTurn(1, null, 'Domanda 1');
    await service.saveReply(first.conversation.id, 'Risposta 1');
    const second = await service.startTurn(1, first.conversation.id, 'Domanda 2');
    assert.equal(second.isNew, false);
    assert.deepEqual(
      second.history.map((m) => `${m.role}:${m.content}`),
      ['user:Domanda 1', 'assistant:Risposta 1', 'user:Domanda 2'],
    );
  });

  it('risposta vuota non salvata', async () => {
    const { service, messages } = fakeModel();
    const turn = await service.startTurn(1, null, 'Domanda');
    await service.saveReply(turn.conversation.id, '  ');
    assert.equal(messages.length, 1);
  });

  it('ognuno vede, riprende ed elimina solo le proprie chat', async () => {
    const { service } = fakeModel();
    const anna = await service.startTurn(1, null, 'Domanda di Anna');
    await service.startTurn(2, null, 'Domanda di Bruno');
    assert.equal((await service.list(1)).length, 1);
    await assert.rejects(service.get(2, anna.conversation.id), notFound);
    await assert.rejects(service.startTurn(2, anna.conversation.id, 'intrusione'), notFound);
    await assert.rejects(service.remove(2, anna.conversation.id), notFound);
    await service.remove(1, anna.conversation.id);
    assert.equal((await service.list(1)).length, 0);
  });

  it('elenco dalla più recente, con titolo; dettaglio con i messaggi', async () => {
    const { service } = fakeModel();
    const a = await service.startTurn(1, null, 'Prima');
    const b = await service.startTurn(1, null, 'Seconda');
    await service.setTitle(a.conversation.id, 'Titolo A');
    await service.startTurn(1, a.conversation.id, 'Ancora la prima');
    const list = await service.list(1);
    assert.deepEqual(
      list.map((c) => [c.id, c.title]),
      [
        [a.conversation.id, 'Titolo A'],
        [b.conversation.id, null],
      ],
    );
    const detail = await service.get(1, a.conversation.id);
    assert.deepEqual(
      detail.messages.map((m) => m.content),
      ['Prima', 'Ancora la prima'],
    );
  });
});
