import cors from '@fastify/cors';
import Fastify from 'fastify';
import config from '../config/load-config.mjs';
import { loadPgConfig } from '../lib/db-config.js';
import { PgClientManager } from '../lib/pg-client-manager.mjs';
import { initPostgresCliPool, profileTest } from '../lib/postgres-cli.mjs';
import { createRequireAuth, registerAuth } from './auth.mjs';
import { runChatAgent } from './chat-agent.mjs';

const PORT = config.server.port;
const CORS_ORIGIN = config.server.corsOrigin;

/**
 * @param {unknown} err
 */
function formatChatError(err) {
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

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} event
 * @param {unknown} data
 */
function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
});

const auth = config.auth;

const pg = new PgClientManager(
  loadPgConfig(process.env.DB_PROFILE || config.postgres?.profile || 'local'),
);
initPostgresCliPool(pg);

await registerAuth(app, auth, pg);

const requireAuth = createRequireAuth(auth, pg);

app.get('/api/health', async (_request, reply) => {
  try {
    const db = await profileTest();
    return reply.send({ ok: true, db });
  } catch (err) {
    return reply.status(503).send({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/api/chat', { preHandler: requireAuth }, async (request, reply) => {
  const body = /** @type {{ messages?: Array<{ role: string; content: string }> }} */ (
    request.body ?? {}
  );

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return reply.status(400).send({ error: 'messages richiesto (array non vuoto)' });
  }

  if (!config.anthropic.apiKey) {
    return reply.status(503).send({
      error: 'anthropic.apiKey non configurata in be/config/config.mjs',
    });
  }

  const messages = body.messages.map((m) => ({
    role: /** @type {'user' | 'assistant' | 'system'} */ (m.role),
    content: String(m.content ?? ''),
  }));

  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const res = reply.raw;

  try {
    const result = await runChatAgent({
      messages,
      onToolEvent: (event) => writeSse(res, event.type, { name: event.name }),
    });

    for await (const chunk of result.textStream) {
      writeSse(res, 'text', { delta: chunk });
    }

    writeSse(res, 'done', {});
    res.end();
  } catch (err) {
    const message = formatChatError(err);
    request.log.error({ err }, 'chat stream failed');
    writeSse(res, 'error', { message });
    res.end();
  }
});

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.info(`Dimmelo API listening on http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
