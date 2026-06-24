import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import { createRequireAuth } from '../lib/auth/require-auth.js';
import { runChatAgent } from '../lib/chat-agent.js';

function formatChatError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
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

export class ChatController extends Abstract_Controller {
  private requireAuth: ReturnType<typeof createRequireAuth>;

  constructor(env: import('../environment.js').Environment) {
    super(env, 'api');
    this.requireAuth = createRequireAuth(env);
    this.router.post('/chat', this.requireAuth, this.postChat.bind(this));
  }

  private async postChat(req: Request, res: Response): Promise<void> {
    const body = req.body as { messages?: Array<{ role: string; content: string }> };

    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      res.status(400).send({ error: 'messages richiesto (array non vuoto)' });
      return;
    }

    if (!this.env.config.anthropic.apiKey) {
      res.status(503).send({
        error: 'anthropic.apiKey non configurata in server/config/config.js',
      });
      return;
    }

    const messages = body.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: String(m.content ?? ''),
    }));

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const result = await runChatAgent({
        messages,
        onToolEvent: (event) => writeSse(res, event.type, { name: event.name }),
      });

      let sentText = false;
      for await (const chunk of result.textStream) {
        if (chunk) {
          sentText = true;
          writeSse(res, 'text', { delta: chunk });
        }
      }

      if (!sentText) {
        writeSse(res, 'error', {
          message:
            'Nessuna risposta generata (limite passi tool raggiunto). Riprova con una domanda più breve.',
        });
      }

      writeSse(res, 'done', {});
      res.end();
    } catch (err) {
      const message = formatChatError(err);
      console.error('chat stream failed', err);
      writeSse(res, 'error', { message });
      res.end();
    }
  }
}
