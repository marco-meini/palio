import fs from 'node:fs';
import path from 'node:path';
import { serverRoot } from '../paths.js';

export const DEFAULT_GOOGLE_OAUTH_PATH = path.join(serverRoot, 'config/google-oauth.json');

export function parseGoogleOAuthJson(data: unknown): { clientId: string; clientSecret: string } | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  const web =
    obj.web && typeof obj.web === 'object' ? (obj.web as Record<string, unknown>) : null;

  const clientId = String(web?.client_id ?? obj.client_id ?? '').trim();
  const clientSecret = String(web?.client_secret ?? obj.client_secret ?? '').trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function loadGoogleOAuthFromFile(
  filePath: string = DEFAULT_GOOGLE_OAUTH_PATH,
): { clientId: string; clientSecret: string } | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return parseGoogleOAuthJson(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function mergeGoogleOAuthCredentials(
  google: { clientId?: string; clientSecret?: string } | undefined,
  filePath: string = DEFAULT_GOOGLE_OAUTH_PATH,
): { clientId: string; clientSecret: string } {
  const fromFile = loadGoogleOAuthFromFile(filePath);
  const clientId =
    String(process.env.GOOGLE_CLIENT_ID ?? '').trim() ||
    String(google?.clientId ?? '').trim() ||
    fromFile?.clientId ||
    '';
  const clientSecret =
    String(process.env.GOOGLE_CLIENT_SECRET ?? '').trim() ||
    String(google?.clientSecret ?? '').trim() ||
    fromFile?.clientSecret ||
    '';
  return { clientId, clientSecret };
}
