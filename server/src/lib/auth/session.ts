import { SignJWT, jwtVerify } from 'jose';
import type { Request, Response } from 'express';
import type { AppConfig } from '../../config.js';
import { findDimmeloUserByEmail, normalizeEmail } from '../dimmelo-users.js';
import type { PgClientManager } from '../pg-client-manager.js';

export { normalizeEmail };

export const SESSION_COOKIE_NAME = 'palio_session';
export const OAUTH_STATE_MOBILE = 'mobile';

/** Session JWT from cookie or `Authorization: Bearer`. */
export function extractSessionToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return undefined;
}

export function maskEmailForDisplay(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at < 1) return '';
  return `${normalized.slice(0, at)}@***`;
}

export async function createSessionToken(
  user: { email: string; name?: string },
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const email = normalizeEmail(user.email);
  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email,
    name: user.name ?? email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key);
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ email: string; name: string } | null> {
  if (!token) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const email = normalizeEmail(
      typeof payload.email === 'string' ? payload.email : String(payload.sub ?? ''),
    );
    if (!email) return null;
    const name =
      typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email;
    return { email, name };
  } catch {
    return null;
  }
}

export async function resolveAuthorizedUser(
  pg: PgClientManager | null | undefined,
  token: string | undefined,
  auth: AppConfig['auth'],
): Promise<{ email: string; name: string } | null> {
  const session = await verifySessionToken(token ?? '', auth.sessionSecret);
  if (!session || !pg) return null;
  const row = await findDimmeloUserByEmail(pg, session.email);
  if (!row) return null;
  return { email: row.email, name: row.display_name };
}

export function setSessionCookie(res: Response, auth: AppConfig['auth'], token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: auth.sessionTtlSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email?: string; name?: string }> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo failed (${response.status})`);
  }

  return (await response.json()) as { email?: string; name?: string };
}

export function hasGoogleOAuthCredentials(google: AppConfig['auth']['google'] | undefined): boolean {
  const clientId = String(google?.clientId ?? '').trim();
  const clientSecret = String(google?.clientSecret ?? '').trim();
  if (!clientId || !clientSecret) return false;
  if (/^REPLACE_/i.test(clientId) || /^REPLACE_/i.test(clientSecret)) return false;
  return true;
}

export function buildGoogleAuthUrl(
  auth: AppConfig['auth'],
  options: { state?: string } = {},
): string {
  const redirectUri = `${auth.publicApiUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: auth.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });
  if (options.state) params.set('state', options.state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function buildMobileAuthRedirect(
  mobileRedirectUri: string,
  params: Record<string, string>,
): string {
  const base = mobileRedirectUri.replace(/\/$/, '');
  const url = new URL(base.includes('://') ? base : `https://${base}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function exchangeGoogleCode(
  auth: AppConfig['auth'],
  code: string,
): Promise<{ access_token: string }> {
  const redirectUri = `${auth.publicApiUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: auth.google.clientId,
      client_secret: auth.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${body}`);
  }

  return (await response.json()) as { access_token: string };
}
