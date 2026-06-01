import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import config from '../config/config.mjs';
import {
  findObjects,
  listTables,
  runQuery,
  schemaInspect,
  truncateForModel,
} from '../lib/postgres-cli.mjs';

const anthropic = createAnthropic({ apiKey: config.anthropic.apiKey });

const MAX_TOOL_STEPS = config.anthropic.maxToolSteps ?? 5;
const MAX_OUTPUT_TOKENS = config.anthropic.maxOutputTokens ?? 4096;
const MAX_TOOL_RESULT_CHARS = config.anthropic.maxToolResultChars ?? 6000;
const MAX_HISTORY_MESSAGES = config.anthropic.maxHistoryMessages ?? 10;
const MAX_MESSAGE_CHARS = config.anthropic.maxMessageChars ?? 4000;

const SYSTEM_PROMPT = `Sei un assistente esperto del Palio di Siena. Rispondi in italiano usando SOLO dati dal database PostgreSQL tramite i tool forniti.

Regole:
- Non inventare numeri o fatti: interroga il DB prima di rispondere.
- Usa get_schema solo se ti serve il dettaglio colonne; altrimenti usa lo schema sintetico qui sotto.
- Preferisci query SQL mirate (LIMIT, filtri) invece di SELECT * su tabelle grandi.
- Le edizioni del Palio sono ordinate per data_palio, poi id su palii.
- Edizioni consecutive = due palii adiacenti in quell'ordine (tipicamente agosto anno N e luglio anno N+1).
- Stesso cavallo = stesso cavallo_id.
- Per le vittorie, evidenzia la data del palio in **grassetto** (markdown).
- Presenta risultati in markdown compatto.
- Non eseguire mai modifiche al database.

Schema sintetico:
- palii: id, source_code, data_palio, straordinario
- contrade: id, name
- cavalli: id, source_id, nome
- fantini: id, source_id, nome, soprannome
- palio_partecipazioni: palio_id, contrada_id, vincitrice, non_partecipa, canape, cavallo_id, fantino_id, ordine, estratta, estratta_da_id, ordine_assegnazione, orecchio, coscia, proprietario_cavallo, cavallo_preso_da, ordine_arrivo
- palio_partecipazione_mangini, capitani, priori, barbareschi, mangini`;

/**
 * @param {import('ai').ModelMessage[]} messages
 */
export function trimMessagesForModel(messages) {
  return messages.slice(-MAX_HISTORY_MESSAGES).map((m) => {
    if (typeof m.content !== 'string') return m;
    if (m.content.length <= MAX_MESSAGE_CHARS) return m;
    return {
      ...m,
      content: `${m.content.slice(0, MAX_MESSAGE_CHARS)}\n\n… (messaggio troncato)`,
    };
  });
}

/**
 * @param {unknown} value
 */
function wrapToolResult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return truncateForModel(text, MAX_TOOL_RESULT_CHARS);
}

/**
 * @param {{ messages: import('ai').ModelMessage[], onToolEvent?: (event: { type: 'tool_start' | 'tool_end'; name: string }) => void }} opts
 */
export function runChatAgent({ messages, onToolEvent }) {
  return streamPalioChat({
    messages: trimMessagesForModel(messages),
    onToolStart: (name) => onToolEvent?.({ type: 'tool_start', name }),
    onToolEnd: (name) => onToolEvent?.({ type: 'tool_end', name }),
  });
}

/**
 * @param {{ messages: import('ai').ModelMessage[], onToolStart?: (name: string) => void, onToolEnd?: (name: string) => void }} opts
 */
export function streamPalioChat({ messages, onToolStart, onToolEnd }) {
  return streamText({
    model: anthropic(config.anthropic.model),
    system: SYSTEM_PROMPT,
    messages,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 1,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    tools: {
      get_schema: tool({
        description:
          'Elenco tabelle o dettaglio schema. Usa tables_only=true di default; full_inspect solo se servono le colonne.',
        inputSchema: z.object({
          full_inspect: z
            .boolean()
            .optional()
            .describe('true = schema inspect completo (pesante); default = solo elenco tabelle'),
          refresh: z.boolean().optional(),
        }),
        execute: async ({ full_inspect, refresh }) => {
          onToolStart?.('get_schema');
          try {
            const out = full_inspect
              ? await schemaInspect({ force: refresh ?? false })
              : await listTables();
            return wrapToolResult(out);
          } finally {
            onToolEnd?.('get_schema');
          }
        },
      }),
      search_schema: tool({
        description: 'Cerca tabelle/colonne per nome (query find).',
        inputSchema: z.object({
          pattern: z.string(),
          types: z.string().optional(),
        }),
        execute: async ({ pattern, types }) => {
          onToolStart?.('search_schema');
          try {
            return wrapToolResult(
              await findObjects(pattern, types ?? 'table,column'),
            );
          } finally {
            onToolEnd?.('search_schema');
          }
        },
      }),
      run_readonly_sql: tool({
        description:
          'SQL read-only (SELECT/WITH). Usa LIMIT; evita SELECT * senza filtro.',
        inputSchema: z.object({
          sql: z.string(),
          intent: z.string().optional(),
        }),
        execute: async ({ sql, intent }) => {
          onToolStart?.('run_readonly_sql');
          try {
            if (intent) console.info('[chat-sql]', intent);
            console.info('[chat-sql]', sql.slice(0, 500));
            return wrapToolResult(await runQuery(sql));
          } finally {
            onToolEnd?.('run_readonly_sql');
          }
        },
      }),
    },
  });
}
