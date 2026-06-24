import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import example from './config.example.mjs';
import { mergeGoogleOAuthCredentials } from './load-google-oauth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string | undefined} raw
 * @param {boolean} defaultValue
 */
function envBool(raw, defaultValue) {
  if (raw === undefined || raw === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw);
}

/**
 * @param {Record<string, unknown>} base
 */
function applyEnvOverrides(base) {
  const cfg = structuredClone(base);

  if (process.env.ANTHROPIC_API_KEY) {
    cfg.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.ANTHROPIC_MODEL) {
    cfg.anthropic.model = process.env.ANTHROPIC_MODEL;
  }

  if (process.env.SERVER_PORT) {
    cfg.server.port = Number(process.env.SERVER_PORT);
  }
  if (process.env.CORS_ORIGIN) {
    cfg.server.corsOrigin = process.env.CORS_ORIGIN;
  }

  if (process.env.AUTH_ENABLED !== undefined && process.env.AUTH_ENABLED !== '') {
    cfg.auth.enabled = envBool(process.env.AUTH_ENABLED, cfg.auth.enabled);
  }
  if (process.env.AUTH_SESSION_SECRET) {
    cfg.auth.sessionSecret = process.env.AUTH_SESSION_SECRET;
  }
  if (process.env.AUTH_SESSION_TTL_SECONDS) {
    cfg.auth.sessionTtlSeconds = Number(process.env.AUTH_SESSION_TTL_SECONDS);
  }
  if (process.env.AUTH_PUBLIC_API_URL) {
    cfg.auth.publicApiUrl = process.env.AUTH_PUBLIC_API_URL;
  }
  if (process.env.AUTH_PUBLIC_APP_URL) {
    cfg.auth.publicAppUrl = process.env.AUTH_PUBLIC_APP_URL;
  }

  const googleFromEnv = {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  };
  cfg.auth.google = mergeGoogleOAuthCredentials({
    clientId: googleFromEnv.clientId || cfg.auth.google?.clientId,
    clientSecret: googleFromEnv.clientSecret || cfg.auth.google?.clientSecret,
  });

  if (process.env.GOOGLE_OAUTH_JSON_PATH) {
    cfg.auth.google = mergeGoogleOAuthCredentials(
      cfg.auth.google,
      process.env.GOOGLE_OAUTH_JSON_PATH,
    );
  }

  return cfg;
}

/**
 * Config per l'API: `config.mjs` locale se presente, altrimenti example + env (Docker).
 */
async function loadBaseConfig() {
  const localPath = path.join(__dirname, 'config.mjs');
  if (fs.existsSync(localPath)) {
    const mod = await import('./config.mjs');
    return mod.default;
  }
  return example;
}

const base = await loadBaseConfig();
const config = applyEnvOverrides(base);

export default config;
