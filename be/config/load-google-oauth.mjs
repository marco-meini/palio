import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {string} */
export const DEFAULT_GOOGLE_OAUTH_PATH = path.join(__dirname, 'google-oauth.json');

/**
 * Estrae client ID e secret dal JSON scaricato da Google Cloud Console.
 * Supporta `web.client_id` / `web.client_secret` e campi top-level `client_id` / `client_secret`.
 *
 * @param {unknown} data
 * @returns {{ clientId: string; clientSecret: string } | null}
 */
export function parseGoogleOAuthJson(data) {
  if (!data || typeof data !== 'object') return null;

  const obj = /** @type {Record<string, unknown>} */ (data);
  const web =
    obj.web && typeof obj.web === 'object'
      ? /** @type {Record<string, unknown>} */ (obj.web)
      : null;

  const clientId = String(web?.client_id ?? obj.client_id ?? '').trim();
  const clientSecret = String(web?.client_secret ?? obj.client_secret ?? '').trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * @param {string} [filePath]
 * @returns {{ clientId: string; clientSecret: string } | null}
 */
export function loadGoogleOAuthFromFile(filePath = DEFAULT_GOOGLE_OAUTH_PATH) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return parseGoogleOAuthJson(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Valori non vuoti in `google` hanno priorità; i campi mancanti vengono da google-oauth.json se presente.
 *
 * @param {{ clientId?: string; clientSecret?: string } | undefined} google
 * @param {string} [filePath]
 */
export function mergeGoogleOAuthCredentials(google, filePath = DEFAULT_GOOGLE_OAUTH_PATH) {
  const fromFile = loadGoogleOAuthFromFile(filePath);
  const clientId = String(google?.clientId ?? '').trim() || fromFile?.clientId || '';
  const clientSecret = String(google?.clientSecret ?? '').trim() || fromFile?.clientSecret || '';
  return { clientId, clientSecret };
}
