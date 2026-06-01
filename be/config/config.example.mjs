import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Copia questo file in `config.mjs` (non versionato) e personalizza i valori.
 *
 *   cp be/config/config.example.mjs be/config/config.mjs
 */
export default {
  /** Connessione pg diretta (task palio.org, Model) */
  db: {
    host: '127.0.0.1',
    port: 5432,
    database: 'app',
    user: 'postgres',
    password: 'postgres',
  },

  /** Skill Postgres CLI (chat, scraper via loadPgConfig opzionale) */
  postgres: {
    cli: path.join(homedir(), '.agents/skills/postgres/scripts/postgres'),
    projectRoot,
    profile: 'local',
  },

  /** Palio Chat — Anthropic */
  anthropic: {
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
    /** Riduce il rischio di rate limit (30k input token/min su tier base) */
    maxOutputTokens: 4096,
    maxToolSteps: 5,
    maxToolResultChars: 6000,
    maxHistoryMessages: 10,
    maxMessageChars: 4000,
  },

  /** API HTTP (be/server) */
  server: {
    port: 3001,
    corsOrigin: 'http://localhost:4200',
  },
};
