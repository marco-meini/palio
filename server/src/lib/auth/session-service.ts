import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { AuthConfig } from '../../auth-config.js';
import type { ISessionWithUserRow, ModelAuth } from '../../model/auth.model.js';
import type { AuthUser } from './auth-types.js';
import { type OidcClient, type OidcIdentity, RefreshRejectedError } from './oidc-client.js';
import type { TokenCrypto } from './token-crypto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** `last_seen_at` viene aggiornato al massimo una volta ogni 5 minuti. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
/** Permessi riletti da ZITADEL (refresh token) al massimo ogni 5 minuti. */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Sessioni server-side: nel cookie un id casuale, in DB solo il suo hash. I permessi sono i
 * ruoli dell'ultimo token di ZITADEL: ogni 5 minuti si rileggono con il refresh token, così
 * un ruolo tolto o un utente disattivato su ZITADEL valgono anche per le sessioni aperte.
 */
export class SessionService {
  /** Refresh in corso per sessione: richieste parallele non usano due volte lo stesso token. */
  private readonly refreshing = new Map<string, Promise<AuthUser | null>>();

  constructor(
    private readonly model: ModelAuth,
    private readonly oidc: Pick<OidcClient, 'refresh'>,
    private readonly crypto: TokenCrypto,
    private readonly config: Pick<AuthConfig, 'secureCookies' | 'session'>,
  ) {}

  /** Crea una sessione per l'utente appena entrato; ritorna il token da mettere nel cookie. */
  async create(userId: number, userAgent: string | null, identity: OidcIdentity): Promise<CreatedSession> {
    const now = Date.now();
    await this.model.deleteExpiredSessions(userId, this.idleCutoff(now));
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now + this.config.session.ttlDays * DAY_MS);
    await this.model.insertSession({
      id_hash: hashSessionToken(token),
      user_id: userId,
      user_agent: userAgent?.slice(0, 500) ?? null,
      permissions: identity.permissions,
      refresh_token_enc: identity.refreshToken ? this.crypto.encrypt(identity.refreshToken) : null,
      id_token: identity.idToken,
      expires_at: expiresAt,
    });
    return { token, expiresAt };
  }

  /** Utente della sessione, o `null` se il token non esiste, è scaduta o ZITADEL la rifiuta. */
  async validate(token: string, now = Date.now()): Promise<AuthUser | null> {
    const idHash = hashSessionToken(token);
    const row = await this.model.findSessionWithUser(idHash);
    if (!row) return null;
    const {
      session_refresh_token_enc: refreshTokenEnc,
      session_refreshed_at: refreshedAt,
      session_last_seen_at: lastSeen,
      session_expires_at: expiresAt,
      ...user
    } = row;
    if (expiresAt.getTime() <= now || lastSeen.getTime() < this.idleCutoff(now).getTime()) {
      await this.model.deleteSession(idHash);
      return null;
    }
    if (refreshTokenEnc && now - refreshedAt.getTime() > REFRESH_INTERVAL_MS) {
      let pending = this.refreshing.get(idHash);
      if (!pending) {
        pending = this.refresh(idHash, row, refreshTokenEnc).finally(() =>
          this.refreshing.delete(idHash),
        );
        this.refreshing.set(idHash, pending);
      }
      return pending;
    }
    if (now - lastSeen.getTime() > TOUCH_INTERVAL_MS) {
      await this.model.touchSession(idHash);
    }
    return user;
  }

  /** Chiude la sessione; ritorna l'ultimo ID token (per il logout su ZITADEL). */
  async destroy(token: string): Promise<string | null> {
    const idHash = hashSessionToken(token);
    const idToken = await this.model.findIdToken(idHash);
    await this.model.deleteSession(idHash);
    return idToken;
  }

  cookieOptions(expiresAt?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'lax',
      path: '/',
      ...(expiresAt ? { expires: expiresAt } : {}),
    };
  }

  private async refresh(
    idHash: string,
    row: ISessionWithUserRow,
    refreshTokenEnc: string,
  ): Promise<AuthUser | null> {
    const {
      session_refresh_token_enc: _r,
      session_refreshed_at: _ra,
      session_last_seen_at: _l,
      session_expires_at: _e,
      ...user
    } = row;
    const refreshToken = this.crypto.decrypt(refreshTokenEnc);
    if (!refreshToken) {
      // COOKIE_SECRET cambiato o dato manomesso: si rientra
      await this.model.deleteSession(idHash);
      return null;
    }
    try {
      const identity = await this.oidc.refresh(refreshToken, user.idp_user_id);
      if (identity.permissions.length === 0) {
        // nessun ruolo rimasto sul progetto: niente più accesso a Dimmelo
        throw new RefreshRejectedError('nessun ruolo');
      }
      await this.model.refreshSession(idHash, {
        permissions: identity.permissions,
        refresh_token_enc: identity.refreshToken ? this.crypto.encrypt(identity.refreshToken) : null,
        id_token: identity.idToken,
      });
      if (identity.displayName !== user.display_name || identity.email !== user.email) {
        await this.model.updateUserProfile(user.id, {
          display_name: identity.displayName,
          email: identity.email,
        });
      }
      return {
        ...user,
        display_name: identity.displayName,
        email: identity.email,
        permissions: identity.permissions,
      };
    } catch (error) {
      if (error instanceof RefreshRejectedError) {
        console.info(`[auth] Sessione dell'utente ${user.id} chiusa: ZITADEL ha rifiutato il refresh`);
        await this.model.deleteSession(idHash);
        return null;
      }
      // ZITADEL irraggiungibile: si resta con i permessi noti e si riprova tra 5 minuti
      await this.model.postponeRefresh(idHash);
      return user;
    }
  }

  private idleCutoff(now: number): Date {
    return new Date(now - this.config.session.idleDays * DAY_MS);
  }
}
