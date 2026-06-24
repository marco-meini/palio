import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeGoogleOAuthCredentials } from './lib/google-oauth.js';
import { serverRoot } from './paths.js';
let cachedConfig = null;
function envBool(raw, defaultValue) {
    if (raw === undefined || raw === '')
        return defaultValue;
    return /^(1|true|yes|on)$/i.test(raw);
}
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
        cfg.auth.google = mergeGoogleOAuthCredentials(cfg.auth.google, process.env.GOOGLE_OAUTH_JSON_PATH);
    }
    return cfg;
}
async function loadBaseConfig() {
    const configDir = path.join(serverRoot, 'config');
    const localPath = path.join(configDir, 'config.mjs');
    const examplePath = path.join(configDir, 'config.example.mjs');
    if (fs.existsSync(localPath)) {
        const mod = await import(pathToFileURL(localPath).href);
        return mod.default;
    }
    const mod = await import(pathToFileURL(examplePath).href);
    return mod.default;
}
export async function initConfig() {
    const base = await loadBaseConfig();
    cachedConfig = applyEnvOverrides(base);
    return cachedConfig;
}
export function getConfig() {
    if (!cachedConfig) {
        throw new Error('Config not initialized — call initConfig() first');
    }
    return cachedConfig;
}
//# sourceMappingURL=config.js.map