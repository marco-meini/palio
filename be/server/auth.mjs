import cookie from '@fastify/cookie';
import oauthPlugin from '@fastify/oauth2';
import { SignJWT, jwtVerify } from 'jose';
import { findDimmeloUserByEmail, normalizeEmail } from '../lib/dimmelo-users.mjs';

export { normalizeEmail };

export const SESSION_COOKIE_NAME = 'palio_session';

/** Local part visible, domain masked (safe for URLs and UI). */
export function maskEmailForDisplay(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at < 1) return '';
  return `${normalized.slice(0, at)}@***`;
}

/**
 * @param {{ email: string; name?: string }} user
 * @param {string} secret
 * @param {number} ttlSeconds
 */
export async function createSessionToken(user, secret, ttlSeconds) {
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

/**
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<{ email: string; name: string } | null>}
 */
export async function verifySessionToken(token, secret) {
  if (!token) return null;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    const email = normalizeEmail(
      typeof payload.email === 'string' ? payload.email : String(payload.sub ?? ''),
    );
    if (!email) return null;
    const name =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : email;
    return { email, name };
  } catch {
    return null;
  }
}

/**
 * @param {{ queryReturnFirst: (sql: string, replacements?: unknown[]) => Promise<{ email: string; display_name: string } | null> } | null | undefined} pg
 * @param {string} token
 * @param {import('../config/config.mjs').default['auth']} auth
 * @returns {Promise<{ email: string; name: string } | null>}
 */
export async function resolveAuthorizedUser(pg, token, auth) {
  const session = await verifySessionToken(token, auth.sessionSecret);
  if (!session) return null;
  if (!pg) return null;
  const row = await findDimmeloUserByEmail(pg, session.email);
  if (!row) return null;
  return { email: row.email, name: row.display_name };
}

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {import('../config/config.mjs').default['auth']} auth
 * @param {string} token
 */
function setSessionCookie(reply, auth, token) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: auth.sessionTtlSeconds,
  });
}

/**
 * @param {import('fastify').FastifyReply} reply
 */
function clearSessionCookie(reply) {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * @param {string} accessToken
 */
async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo failed (${response.status})`);
  }

  return /** @type {{ email?: string; name?: string }} */ (await response.json());
}

/**
 * @param {import('../config/config.mjs').default['auth']} auth
 * @param {{ queryReturnFirst: (sql: string, replacements?: unknown[]) => Promise<unknown> } | null | undefined} pg
 */
export function createRequireAuth(auth, pg) {
  return async function requireAuth(request, reply) {
    if (!auth?.enabled) return;

    const token = request.cookies?.[SESSION_COOKIE_NAME];
    const user = await resolveAuthorizedUser(pg, token, auth);
    if (!user) {
      return reply.status(401).send({ error: 'Autenticazione richiesta' });
    }

    request.user = user;
  };
}

/**
 * @param {import('../config/config.mjs').default['auth']['google'] | undefined} google
 */
export function hasGoogleOAuthCredentials(google) {
  const clientId = String(google?.clientId ?? '').trim();
  const clientSecret = String(google?.clientSecret ?? '').trim();
  if (!clientId || !clientSecret) return false;
  if (/^REPLACE_/i.test(clientId) || /^REPLACE_/i.test(clientSecret)) return false;
  return true;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {import('../config/config.mjs').default['auth']} auth
 * @param {{ queryReturnFirst: (sql: string, replacements?: unknown[]) => Promise<unknown> } | null | undefined} pg
 */
export async function registerAuth(app, auth, pg) {
  await app.register(cookie);

  app.get('/api/auth/me', async (request, reply) => {
    if (!auth?.enabled) {
      return reply.send({ email: null, name: null, authEnabled: false });
    }

    const token = request.cookies?.[SESSION_COOKIE_NAME];
    const user = await resolveAuthorizedUser(pg, token, auth);
    if (!user) {
      return reply.status(401).send({ error: 'Non autenticato' });
    }

    return reply.send({
      email: user.email,
      name: user.name,
      authEnabled: true,
    });
  });

  app.get('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  if (!auth?.enabled) return;

  if (!auth.sessionSecret || auth.sessionSecret.length < 32) {
    throw new Error(
      'auth.sessionSecret deve essere impostato (≥32 caratteri) quando auth.enabled è true',
    );
  }

  if (!pg) {
    throw new Error(
      'config.db è richiesto quando auth.enabled è true (allowlist utenti in dimmelo_users)',
    );
  }

  if (!hasGoogleOAuthCredentials(auth.google)) {
    app.log.warn(
      'auth.enabled è true ma Google OAuth non è configurato: /api/auth/google risponde 503 finché non imposti clientId e clientSecret in config.mjs o be/config/google-oauth.json',
    );

    app.get('/api/auth/google', async (_request, reply) => {
      return reply.status(503).send({
        error:
          'Google OAuth non configurato. Imposta auth.google in be/config/config.mjs oppure be/config/google-oauth.json',
      });
    });

    app.get('/api/auth/google/callback', async (_request, reply) => {
      return reply.status(503).send({
        error:
          'Google OAuth non configurato. Imposta auth.google in be/config/config.mjs oppure be/config/google-oauth.json',
      });
    });

    return;
  }

  await app.register(oauthPlugin, {
    name: 'googleOAuth2',
    scope: ['openid', 'email', 'profile'],
    credentials: {
      client: {
        id: auth.google.clientId,
        secret: auth.google.clientSecret,
      },
      auth: oauthPlugin.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/api/auth/google',
    callbackUri: `${auth.publicApiUrl.replace(/\/$/, '')}/api/auth/google/callback`,
  });

  app.get('/api/auth/google/callback', async function googleCallback(request, reply) {
    try {
      const { token } = await this.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const userInfo = await fetchGoogleUserInfo(token.access_token);
      const email = normalizeEmail(userInfo.email);
      const row = await findDimmeloUserByEmail(pg, email);

      if (!row) {
        const masked = maskEmailForDisplay(email);
        request.log.warn(
          { email: masked || '(missing)' },
          'Google login denied: email not in dimmelo_users',
        );
        const deniedUrl = new URL('/login', auth.publicAppUrl);
        deniedUrl.searchParams.set('error', 'access_denied');
        if (masked) deniedUrl.searchParams.set('email', masked);
        return reply.redirect(deniedUrl.toString());
      }

      const sessionToken = await createSessionToken(
        { email: row.email, name: row.display_name },
        auth.sessionSecret,
        auth.sessionTtlSeconds,
      );
      setSessionCookie(reply, auth, sessionToken);
      return reply.redirect(auth.publicAppUrl);
    } catch (err) {
      request.log.error({ err }, 'Google OAuth callback failed');
      const errorUrl = new URL('/login', auth.publicAppUrl);
      errorUrl.searchParams.set('error', 'oauth_failed');
      return reply.redirect(errorUrl.toString());
    }
  });
}
