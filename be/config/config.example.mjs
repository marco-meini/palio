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
  /**
   * Connessione Postgres per API auth/chat in dev (se DATABASE_URL non è impostata).
   * I task scraper possono usare ancora .skills/postgres/config.toml via loadPgConfig().
   */
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
    model: 'claude-sonnet-4-6',
    /** Riduce il rischio di rate limit (30k input token/min su tier base) */
    maxOutputTokens: 4096,
    /** Step LLM (tool + risposta). Con 5 il modello può esaurire i tool senza rispondere. */
    maxToolSteps: 12,
    /** Dopo N ricerche regolamento i tool vengono disabilitati per forzare la risposta. */
    maxRegolamentoCalls: 2,
    maxToolResultChars: 6000,
    maxHistoryMessages: 10,
    maxMessageChars: 4000,
    /** Compatta tabelle CLI in markdown prima di inviarle al modello */
    compactToolResults: true,
    /** Righe massime nelle tabelle compattate */
    maxToolResultRows: 50,
  },

  /** Regolamento Palio — RAG (indice generato con npm run index-regolamento) */
  regolamento: {
    indexPath: 'data/regolamento-index.json',
    topK: 8,
    minScore: 0.35,
  },

  /** API HTTP (be/server) */
  server: {
    port: 3001,
    corsOrigin: 'http://localhost:4200',
  },

  /**
   * Autenticazione OAuth Google.
   * Con enabled: true la chat e POST /api/chat richiedono sessione valida; senza cookie → 401 e redirect a /login.
   * Se clientId/clientSecret mancano (in config e in google-oauth.json) o sono placeholder, l'API parte comunque; /api/auth/google risponde 503 finché non configuri OAuth.
   * In dev locale puoi usare enabled: false per saltare il login (l'API risponde authEnabled: false).
   */
  auth: {
    enabled: false,
    /** ≥32 caratteri; genera con: openssl rand -base64 48 */
    sessionSecret: '',
    sessionTtlSeconds: 604800,
    google: {
      /** Opzionale: lascia vuoto e usa be/config/google-oauth.json (vedi google-oauth.example.json) */
      clientId: '',
      clientSecret: '',
    },
    /** Utenti autorizzati: tabella Postgres `dimmelo_users` (vedi db/migrations/dimmelo_users.sql). */
    /** Produzione: https://dimmelo.marcomeini.it (stesso valore per entrambi) */
    publicApiUrl: 'http://localhost:3001',
    publicAppUrl: 'http://localhost:4200',
  },
};
