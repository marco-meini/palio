import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Login OIDC in corso, conservato nel cookie temporaneo tra `/login` e `/callback`.
 * Firmato: non si può falsificare; non contiene segreti verso terzi (il code verifier serve
 * solo insieme al codice che ZITADEL rimanda a questo browser).
 */
export interface LoginState {
  /** Parametro `state` (anti-CSRF del redirect). */
  state: string;
  /** Parametro `nonce` (lega l'ID token a questo login). */
  nonce: string;
  /** PKCE code verifier. */
  codeVerifier: string;
  /** Path interno a cui tornare dopo l'accesso. */
  returnTo: string;
  /** Scadenza (epoch ms). */
  expiresAt: number;
}

export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

// Prefisso di dominio: una firma valida per altri usi non vale qui.
function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`login.${payload}`).digest('base64url');
}

/** Serializza e firma lo stato: `<payload base64url>.<hmac>`. */
export function encodeLoginState(state: LoginState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

/** Verifica firma e scadenza; `null` se il valore è manomesso, malformato o scaduto. */
export function decodeLoginState(
  value: string,
  secret: string,
  now = Date.now(),
): LoginState | null {
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LoginState;
    for (const key of ['state', 'nonce', 'codeVerifier', 'returnTo'] as const) {
      if (typeof state[key] !== 'string') return null;
    }
    if (typeof state.expiresAt !== 'number' || state.expiresAt < now) return null;
    return state;
  } catch {
    return null;
  }
}

/** Solo path interni (anti open-redirect): altrimenti la home. */
export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    value.length <= 500
    ? value
    : '/';
}
