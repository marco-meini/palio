import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import type { Environment } from '../environment.js';
import { currentUser } from '../lib/auth/auth-guard.js';
import { runChatAgent } from '../lib/chat-agent.js';
import { ChatHistoryService } from '../lib/chat/chat-history.js';
import { generateChatTitle } from '../lib/chat/chat-title.js';
import { createDb } from '../lib/db.js';
import { badRequest, HttpError } from '../lib/http-error.js';
import { ModelChat } from '../model/chat.model.js';

/** Lunghezza massima di una domanda. */
const MAX_QUESTION_CHARS = 8000;

function formatChatError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  if (status === 401 || /invalid x-api-key|authentication/i.test(raw)) {
    return 'Chiave Anthropic non valida (ANTHROPIC_API_KEY): controlla la configurazione del server.';
  }
  if (/rate limit|429|maxRetriesExceeded/i.test(raw)) {
    return (
      'Limite Anthropic raggiunto (troppi token in ingresso al minuto). ' +
      'Attendi circa 1 minuto e riprova, oppure fai domande più brevi. ' +
      'Suggerimento: evita conversazioni molto lunghe in una sola sessione.'
    );
  }
  return raw;
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function idParam(req: Request): number {
  const id = Number(req.params['id']);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('Id non valido');
  return id;
}

/**
 * Chat Dimmelo (permesso `chat.use`): conversazioni salvate per utente su `/api/chats` e
 * domanda con risposta in streaming (SSE) su `POST /api/chat`.
 */
export class ChatController extends Abstract_Controller {
  private readonly chats: ChatHistoryService;

  constructor(env: Environment) {
    super(env, 'api');
    this.chats = new ChatHistoryService(new ModelChat(createDb(env.pgConnection)));
    const chat = env.auth.guard.require('chat.use');
    this.router.get('/chats', chat, this.list.bind(this));
    this.router.get('/chats/:id', chat, this.get.bind(this));
    this.router.delete('/chats/:id', chat, this.remove.bind(this));
    this.router.post('/chat', chat, this.postChat.bind(this));
  }

  private async list(req: Request, res: Response): Promise<void> {
    res.send(await this.chats.list(currentUser(req).id));
  }

  private async get(req: Request, res: Response): Promise<void> {
    res.send(await this.chats.get(currentUser(req).id, idParam(req)));
  }

  private async remove(req: Request, res: Response): Promise<void> {
    await this.chats.remove(currentUser(req).id, idParam(req));
    res.status(204).end();
  }

  /**
   * Nuova domanda: `{ conversationId?: number, message: string }`. Senza `conversationId` crea
   * la conversazione. Eventi SSE: `conversation` (`{ id }`, subito), `tool_start`/`tool_end`,
   * `text` (`{ delta }`), `title` (`{ title }`, solo per una conversazione nuova), `error`, `done`.
   */
  private async postChat(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as { conversationId?: unknown; message?: unknown };
    const question = typeof body.message === 'string' ? body.message.trim() : '';
    if (!question) throw badRequest('Scrivi una domanda');
    if (question.length > MAX_QUESTION_CHARS) {
      throw badRequest(`Domanda troppo lunga (massimo ${MAX_QUESTION_CHARS} caratteri)`);
    }
    const conversationId =
      body.conversationId === undefined || body.conversationId === null
        ? null
        : Number(body.conversationId);
    if (conversationId !== null && (!Number.isSafeInteger(conversationId) || conversationId <= 0)) {
      throw badRequest('Chat non valida');
    }
    if (!this.env.config.anthropic.apiKey) {
      throw new HttpError(503, 'ANTHROPIC_API_KEY non configurata — impostala in .env');
    }

    const turn = await this.chats.startTurn(currentUser(req).id, conversationId, question);
    const { conversation } = turn;
    // il titolo si genera dalla prima domanda, in parallelo alla risposta
    const title = turn.isNew ? generateChatTitle(question) : null;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    writeSse(res, 'conversation', { id: conversation.id });

    let reply = '';
    let failed = false;
    try {
      const result = await runChatAgent({
        messages: turn.history,
        pg: this.env.pgConnection,
        onToolEvent: (event) => writeSse(res, event.type, { name: event.name }),
      });

      // fullStream e non textStream: gli errori dell'API (chiave, limiti…) arrivano come parti
      // `error` dello stream, non come eccezioni
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta' && part.text) {
          reply += part.text;
          writeSse(res, 'text', { delta: part.text });
        } else if (part.type === 'error') {
          failed = true;
          console.error('chat stream failed', part.error);
          writeSse(res, 'error', { message: formatChatError(part.error) });
        }
      }

      if (!reply && !failed) {
        writeSse(res, 'error', {
          message:
            'Nessuna risposta generata (limite passi tool raggiunto). Riprova con una domanda più breve.',
        });
      }
    } catch (err) {
      console.error('chat stream failed', err);
      writeSse(res, 'error', { message: formatChatError(err) });
    }

    // anche una risposta interrotta resta nella conversazione
    await this.chats.saveReply(conversation.id, reply).catch((error: unknown) => {
      console.error(`[chat] Risposta non salvata (chat ${conversation.id})`, error);
    });
    if (title) {
      const text = await title;
      await this.chats.setTitle(conversation.id, text).catch((error: unknown) => {
        console.error(`[chat] Titolo non salvato (chat ${conversation.id})`, error);
      });
      writeSse(res, 'title', { title: text });
    }
    writeSse(res, 'done', {});
    res.end();
  }
}
