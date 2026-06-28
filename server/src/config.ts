import path from 'node:path';
import { homedir } from 'node:os';
import { mergeGoogleOAuthCredentials } from './lib/google-oauth.js';
import { loadEnvFiles } from './load-env.js';
import { repoRoot } from './paths.js';

export interface AppConfig {
  anthropic: {
    apiKey: string;
    model: string;
    maxOutputTokens: number;
    maxToolSteps: number;
    maxRegolamentoCalls: number;
    maxToolResultChars: number;
    maxHistoryMessages: number;
    maxMessageChars: number;
    compactToolResults: boolean;
    maxToolResultRows: number;
  };
  regolamento: {
    topK: number;
    minScore: number;
  };
  server: {
    port: number;
    corsOrigin: string;
  };
  auth: {
    enabled: boolean;
    sessionSecret: string;
    sessionTtlSeconds: number;
    google: {
      clientId: string;
      clientSecret: string;
    };
    publicApiUrl: string;
    publicAppUrl: string;
  };
  /** Fallback skill Postgres CLI (se il driver pg non è disponibile). */
  postgres: {
    cli: string;
    projectRoot: string;
    profile: string;
  };
}

let cachedConfig: AppConfig | null = null;

function envBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw);
}

function envInt(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function envString(raw: string | undefined, defaultValue = ''): string {
  if (raw === undefined || raw === '') return defaultValue;
  return raw;
}

function buildConfigFromEnv(): AppConfig {
  const googleOAuthPath =
    process.env.GOOGLE_OAUTH_JSON_PATH ??
    path.join(repoRoot, 'server/config/google-oauth.json');

  return {
    anthropic: {
      apiKey: envString(process.env.ANTHROPIC_API_KEY),
      model: envString(process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-6'),
      maxOutputTokens: envInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 4096),
      maxToolSteps: envInt(process.env.ANTHROPIC_MAX_TOOL_STEPS, 12),
      maxRegolamentoCalls: envInt(process.env.ANTHROPIC_MAX_REGOLAMENTO_CALLS, 2),
      maxToolResultChars: envInt(process.env.ANTHROPIC_MAX_TOOL_RESULT_CHARS, 6000),
      maxHistoryMessages: envInt(process.env.ANTHROPIC_MAX_HISTORY_MESSAGES, 10),
      maxMessageChars: envInt(process.env.ANTHROPIC_MAX_MESSAGE_CHARS, 4000),
      compactToolResults: envBool(process.env.ANTHROPIC_COMPACT_TOOL_RESULTS, true),
      maxToolResultRows: envInt(process.env.ANTHROPIC_MAX_TOOL_RESULT_ROWS, 50),
    },
    regolamento: {
      topK: envInt(process.env.REGOLAMENTO_TOP_K, 8),
      minScore: Number(process.env.REGOLAMENTO_MIN_SCORE ?? 0.35),
    },
    server: {
      port: envInt(process.env.SERVER_PORT, 3001),
      corsOrigin: envString(process.env.CORS_ORIGIN, 'http://localhost:4200'),
    },
    auth: {
      enabled: envBool(process.env.AUTH_ENABLED, false),
      sessionSecret: envString(process.env.AUTH_SESSION_SECRET),
      sessionTtlSeconds: envInt(process.env.AUTH_SESSION_TTL_SECONDS, 604800),
      google: mergeGoogleOAuthCredentials(undefined, googleOAuthPath),
      publicApiUrl: envString(process.env.AUTH_PUBLIC_API_URL, 'http://localhost:3001'),
      publicAppUrl: envString(process.env.AUTH_PUBLIC_APP_URL, 'http://localhost:4200'),
    },
    postgres: {
      cli: envString(
        process.env.POSTGRES_CLI,
        path.join(homedir(), '.agents/skills/postgres/scripts/postgres'),
      ),
      projectRoot: envString(process.env.DB_PROJECT_ROOT, repoRoot),
      profile: envString(process.env.DB_PROFILE, 'local'),
    },
  };
}

export async function initConfig(): Promise<AppConfig> {
  loadEnvFiles();
  cachedConfig = buildConfigFromEnv();
  return cachedConfig;
}

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error('Config not initialized — call initConfig() first');
  }
  return cachedConfig;
}
