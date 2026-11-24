import type { Request } from 'express';

/** Cookie di sessione (id casuale; in DB solo il suo hash). */
export const SESSION_COOKIE = 'palio_sid';
/** Cookie temporaneo con il login con passkey in corso (sessione ZITADEL), firmato HMAC. */
export const LOGIN_COOKIE = 'palio_login';
/** Path del cookie di login: serve solo a /api/auth/passkey/finish. */
export const LOGIN_COOKIE_PATH = '/api/auth';

/** Record di `app_user`. */
export interface IAppUserRecord {
  id: number;
  /** Id dell'utente su ZITADEL; `null` finché non apre il primo link d'accesso. */
  idp_user_id: string | null;
  first_name: string;
  last_name: string;
  /** Mantenuto dall'app: `first_name last_name`. */
  display_name: string;
  email: string;
  phone: string | null;
  /** Amministratore: tutti i permessi, anche quelli delle funzioni future. */
  is_admin: boolean;
  disabled_at: Date | null;
  created_by: number | null;
  last_login_at: Date | null;
  /** Hash SHA-256 del link d'accesso valido (invito o recupero), se c'è. */
  access_link_hash: string | null;
  access_link_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Record di `user_session`. */
export interface IUserSessionRecord {
  /** SHA-256 (hex) del token nel cookie. */
  id_hash: string;
  user_id: number;
  user_agent: string | null;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
}

/** Utente autenticato: record `app_user` con i permessi assegnati (senza quelli impliciti). */
export type AuthUser = IAppUserRecord & { permissions: string[] };

/** Request Express arricchita dal controllo di autenticazione. */
export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}
