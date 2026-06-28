// @ts-nocheck
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { compactToolResult } from './compact-tool-result.js';
import { findObjects, listTables, runQuery, schemaInspect, truncateForModel, } from './postgres-cli.js';
import { RECIPE_IDS, runPalioRecipe } from './palio-recipes.js';
import { searchRegolamento } from './regolamento-rag.js';
import { buildChatSystemPrompt } from './chat-domain-knowledge.js';
function settings() {
    const config = getConfig();
    return {
        anthropic: createAnthropic({ apiKey: config.anthropic.apiKey }),
        config,
        maxToolSteps: config.anthropic.maxToolSteps ?? 12,
        maxRegolamentoCalls: config.anthropic.maxRegolamentoCalls ?? 2,
        maxOutputTokens: config.anthropic.maxOutputTokens ?? 4096,
        maxToolResultChars: config.anthropic.maxToolResultChars ?? 6000,
        maxHistoryMessages: config.anthropic.maxHistoryMessages ?? 10,
        maxMessageChars: config.anthropic.maxMessageChars ?? 4000,
        compactToolResults: config.anthropic.compactToolResults ?? true,
        maxToolResultRows: config.anthropic.maxToolResultRows ?? 50,
    };
}
const SYSTEM_PROMPT = buildChatSystemPrompt();
export function trimMessagesForModel(messages) {
    const { maxHistoryMessages, maxMessageChars } = settings();
    return messages.slice(-maxHistoryMessages).map((m) => {
        if (typeof m.content !== 'string')
            return m;
        if (m.content.length <= maxMessageChars)
            return m;
        return {
            ...m,
            content: `${m.content.slice(0, maxMessageChars)}\n\n… (messaggio troncato)`,
        };
    });
}
function wrapToolResult(value) {
    const s = settings();
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const compacted = compactToolResult(text, {
        enabled: s.compactToolResults,
        maxRows: s.maxToolResultRows,
        maxChars: s.maxToolResultChars,
    });
    return truncateForModel(compacted, s.maxToolResultChars);
}
export function runChatAgent({ messages, onToolEvent, pg, }) {
    return streamPalioChat({
        messages: trimMessagesForModel(messages),
        onToolStart: (name) => onToolEvent?.({ type: 'tool_start', name }),
        onToolEnd: (name) => onToolEvent?.({ type: 'tool_end', name }),
        pg,
    });
}
function countRegolamentoCalls(steps) {
    return steps
        .flatMap((step) => step.toolCalls ?? [])
        .filter((call) => call.toolName === 'search_regolamento').length;
}
export function streamPalioChat({ messages, onToolStart, onToolEnd, pg, }) {
    const s = settings();
    return streamText({
        model: s.anthropic(s.config.anthropic.model),
        system: SYSTEM_PROMPT,
        messages,
        maxOutputTokens: s.maxOutputTokens,
        maxRetries: 1,
        stopWhen: stepCountIs(s.maxToolSteps),
        prepareStep: ({ steps }) => {
            if (countRegolamentoCalls(steps) >= s.maxRegolamentoCalls) {
                return { activeTools: [] };
            }
            return {};
        },
        tools: {
            search_regolamento: tool({
                description: 'Cerca nel Regolamento ufficiale del Palio (max 2 chiamate per domanda). ' +
                    'Usa una query ampia che copra tutti gli aspetti; poi rispondi con i passaggi trovati.',
                inputSchema: z.object({
                    query: z.string(),
                }),
                execute: async ({ query }) => {
                    onToolStart?.('search_regolamento');
                    try {
                        console.info('[chat-regolamento]', query.slice(0, 200));
                        return wrapToolResult(await searchRegolamento(query, {
                            topK: s.config.regolamento?.topK ?? 8,
                        }, pg));
                    }
                    catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error('[chat-regolamento]', message);
                        return wrapToolResult(`Errore ricerca regolamento: ${message}`);
                    }
                    finally {
                        onToolEnd?.('search_regolamento');
                    }
                },
            }),
            run_palio_recipe: tool({
                description: 'Query predefinite Palio (preferire rispetto a SQL libero). Una sola chiamata per domanda.',
                inputSchema: z.object({
                    recipe: z.enum(RECIPE_IDS),
                    contrada: z.string().optional(),
                    year_from: z.number().int().optional(),
                    year_to: z.number().int().optional(),
                    source_code: z.string().optional(),
                    data_palio: z.string().optional(),
                    person: z.string().optional(),
                    role: z
                        .enum(['capitano', 'priore', 'barbaresco', 'fantino', 'mangini', 'any'])
                        .optional(),
                }),
                execute: async (params) => {
                    onToolStart?.('run_palio_recipe');
                    try {
                        const { recipe, ...rest } = params;
                        console.info('[chat-recipe]', recipe, rest);
                        return wrapToolResult(await runPalioRecipe(recipe, rest));
                    }
                    finally {
                        onToolEnd?.('run_palio_recipe');
                    }
                },
            }),
            get_schema: tool({
                description: 'Solo se indispensabile. Default: elenco tabelle; full_inspect=true solo per colonne.',
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
                    }
                    finally {
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
                        return wrapToolResult(await findObjects(pattern, types ?? 'table,column'));
                    }
                    finally {
                        onToolEnd?.('search_schema');
                    }
                },
            }),
            run_readonly_sql: tool({
                description: 'SQL read-only solo se nessuna ricetta applica. Una query con LIMIT.',
                inputSchema: z.object({
                    sql: z.string(),
                    intent: z.string().optional(),
                }),
                execute: async ({ sql, intent }) => {
                    onToolStart?.('run_readonly_sql');
                    try {
                        if (intent)
                            console.info('[chat-sql]', intent);
                        console.info('[chat-sql]', sql.slice(0, 500));
                        return wrapToolResult(await runQuery(sql));
                    }
                    finally {
                        onToolEnd?.('run_readonly_sql');
                    }
                },
            }),
        },
    });
}
//# sourceMappingURL=chat-agent.js.map