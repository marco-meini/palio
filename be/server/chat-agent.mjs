import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import config from '../config/load-config.mjs';
import { compactToolResult } from '../lib/compact-tool-result.mjs';
import {
  findObjects,
  listTables,
  runQuery,
  schemaInspect,
  truncateForModel,
} from '../lib/postgres-cli.mjs';
import { RECIPE_IDS, runPalioRecipe } from '../lib/palio-recipes.mjs';
import { searchRegolamento } from '../lib/regolamento-rag.mjs';
import { buildChatSystemPrompt } from './chat-domain-knowledge.mjs';

const anthropic = createAnthropic({ apiKey: config.anthropic.apiKey });

const MAX_TOOL_STEPS = config.anthropic.maxToolSteps ?? 5;
const MAX_OUTPUT_TOKENS = config.anthropic.maxOutputTokens ?? 4096;
const MAX_TOOL_RESULT_CHARS = config.anthropic.maxToolResultChars ?? 6000;
const MAX_HISTORY_MESSAGES = config.anthropic.maxHistoryMessages ?? 10;
const MAX_MESSAGE_CHARS = config.anthropic.maxMessageChars ?? 4000;
const COMPACT_TOOL_RESULTS = config.anthropic.compactToolResults ?? true;
const MAX_TOOL_RESULT_ROWS = config.anthropic.maxToolResultRows ?? 50;

const SYSTEM_PROMPT = buildChatSystemPrompt();

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
  const compacted = compactToolResult(text, {
    enabled: COMPACT_TOOL_RESULTS,
    maxRows: MAX_TOOL_RESULT_ROWS,
    maxChars: MAX_TOOL_RESULT_CHARS,
  });
  return truncateForModel(compacted, MAX_TOOL_RESULT_CHARS);
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
      search_regolamento: tool({
        description:
          'Cerca nel Regolamento ufficiale del Palio. Usare per regole, procedimenti, definizioni ufficiali.',
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: async ({ query }) => {
          onToolStart?.('search_regolamento');
          try {
            console.info('[chat-regolamento]', query.slice(0, 200));
            return wrapToolResult(await searchRegolamento(query));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[chat-regolamento]', message);
            return wrapToolResult(`Errore ricerca regolamento: ${message}`);
          } finally {
            onToolEnd?.('search_regolamento');
          }
        },
      }),
      run_palio_recipe: tool({
        description:
          'Query predefinite Palio (preferire rispetto a SQL libero). Una sola chiamata per domanda.',
        inputSchema: z.object({
          recipe: z.enum(RECIPE_IDS),
          contrada: z.string().optional(),
          year_from: z.number().int().optional(),
          year_to: z.number().int().optional(),
          source_code: z.string().optional(),
          data_palio: z.string().optional(),
        }),
        execute: async (params) => {
          onToolStart?.('run_palio_recipe');
          try {
            const { recipe, ...rest } = params;
            console.info('[chat-recipe]', recipe, rest);
            return wrapToolResult(await runPalioRecipe(recipe, rest));
          } finally {
            onToolEnd?.('run_palio_recipe');
          }
        },
      }),
      get_schema: tool({
        description:
          'Solo se indispensabile. Default: elenco tabelle; full_inspect=true solo per colonne.',
        inputSchema: z.object({
          full_inspect: z.boolean().optional(),
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
        description: 'Solo se indispensabile: cerca tabelle/colonne per nome.',
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
          'SQL read-only solo se nessuna ricetta applica. Una query con LIMIT.',
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
