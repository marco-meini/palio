import { createHmac, timingSafeEqual } from 'node:crypto';

/** Login con passkey in corso, conservato nel cookie temporaneo tra `start` e `finish`. */
export interface LoginState {
  /** Sessione ZITADEL con la challenge WebAuthn. */
  sessionId: string;
  /** Utente di palio che sta entrando. */
  userId: number;
  /** Scadenza (epoch ms). */
  expiresAt: number;
}

export const LOGIN_STATE_TTL_MS = 5 * 60 * 1000;

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
    if (typeof state.sessionId !== 'string' || !Number.isInteger(state.userId)) return null;
    if (typeof state.expiresAt !== 'number' || state.expiresAt < now) return null;
    return state;
  } catch {
    return null;
  }
}
