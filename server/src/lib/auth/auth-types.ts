import type { Request } from 'express';

/** Cookie di sessione (id casuale; in DB solo il suo hash). */
export const SESSION_COOKIE = 'palio_sid';
/** Cookie temporaneo con il login OIDC in corso (state, nonce, PKCE), firmato HMAC. */
export const LOGIN_COOKIE = 'palio_login';
/** Path del cookie di login: serve solo a /api/auth/callback. */
export const LOGIN_COOKIE_PATH = '/api/auth';

/** Record di `app_user`: chi è entrato almeno una volta (profilo dall'ID token). */
export interface IAppUserRecord {
  id: number;
  /** Id dell'utente su ZITADEL (claim `sub`). */
  idp_user_id: string;
  display_name: string;
  email: string | null;
  last_login_at: Date;
  created_at: Date;
}

/** Record di `user_session`. */
export interface IUserSessionRecord {
  /** SHA-256 (hex) del token nel cookie. */
  id_hash: string;
  user_id: number;
  user_agent: string | null;
  /** Ruoli del progetto Dimmelo nell'ultimo token (permessi assegnati, senza gli impliciti). */
  permissions: string[];
  /** Refresh token di ZITADEL, cifrato. */
  refresh_token_enc: string | null;
  /** Ultimo ID token, per il logout su ZITADEL. */
  id_token: string | null;
  /** Ultimo aggiornamento dei permessi da ZITADEL. */
  refreshed_at: Date;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
}

/** Utente autenticato: profilo con i permessi assegnati su ZITADEL (senza quelli impliciti). */
export type AuthUser = IAppUserRecord & { permissions: string[] };

/** Request Express arricchita dal controllo di autenticazione. */
export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}
