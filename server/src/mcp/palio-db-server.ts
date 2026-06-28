// @ts-nocheck
/**
 * MCP sidecar: espone gli stessi tool DB del chatbot Dimmelo su stdio.
 *
 * Cursor / Claude Desktop example (.cursor/mcp.json):
 * {
 *   "mcpServers": {
 *     "palio-db": {
 *       "command": "npm",
 *       "args": ["run", "mcp:palio-db", "--prefix", "server"],
 *       "env": {
 *         "CHAT_DATABASE_URL": "postgresql://palio_chat_ro:SECRET@host:port/palio"
 *       }
 *     }
 *   }
 * }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initConfig } from '../config.js';
import { resolveChatPgConfig } from '../lib/db-config.js';
import {
  findObjects,
  initPostgresCliPool,
  listTables,
  runQuery,
  schemaInspect,
} from '../lib/postgres-cli.js';
import { PgClientManager } from '../lib/pg-client-manager.js';
import { RECIPE_IDS, runPalioRecipe } from '../lib/palio-recipes.js';

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function toolError(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true as const,
  };
}

async function main() {
  await initConfig();
  const chatPg = new PgClientManager(resolveChatPgConfig());
  initPostgresCliPool(chatPg);

  const server = new McpServer({
    name: 'palio-db',
    version: '1.0.0',
  });

  server.registerTool(
    'run_palio_recipe',
    {
      description:
        'Query predefinite Palio (preferire rispetto a SQL libero). Una sola chiamata per domanda.',
      inputSchema: z.object({
        recipe: z.enum(RECIPE_IDS),
        contrada: z.string().optional(),
        year_from: z.number().int().optional(),
        year_to: z.number().int().optional(),
        source_code: z.string().optional(),
        data_palio: z.string().optional(),
        person: z.string().optional(),
        horse: z.string().optional(),
        limit: z.number().int().positive().optional(),
        role: z
          .enum(['capitano', 'priore', 'barbaresco', 'fantino', 'mangini', 'any'])
          .optional(),
      }),
    },
    async (params) => {
      try {
        const { recipe, ...rest } = params;
        return textResult(await runPalioRecipe(recipe, rest));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  );

  server.registerTool(
    'run_readonly_sql',
    {
      description: 'SQL read-only solo se nessuna ricetta applica. Una query con LIMIT.',
      inputSchema: z.object({
        sql: z.string(),
        intent: z.string().optional(),
      }),
    },
    async ({ sql }) => {
      try {
        return textResult(await runQuery(sql));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  );

  server.registerTool(
    'get_schema',
    {
      description:
        'Solo se indispensabile. Default: elenco tabelle; full_inspect=true solo per colonne.',
      inputSchema: z.object({
        full_inspect: z.boolean().optional(),
        refresh: z.boolean().optional(),
      }),
    },
    async ({ full_inspect, refresh }) => {
      try {
        const out = full_inspect
          ? await schemaInspect({ force: refresh ?? false })
          : await listTables();
        return textResult(out);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  );

  server.registerTool(
    'search_schema',
    {
      description: 'Solo se indispensabile: cerca tabelle/colonne per nome.',
      inputSchema: z.object({
        pattern: z.string(),
        types: z.string().optional(),
      }),
    },
    async ({ pattern, types }) => {
      try {
        return textResult(await findObjects(pattern, types ?? 'table,column'));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return toolError(message);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[palio-mcp]', err);
  process.exit(1);
});
