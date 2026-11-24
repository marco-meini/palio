import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions } from 'express';
import type { AuthConfig } from '../../auth-config.js';
import type { ModelAuth } from '../../model/auth.model.js';
import type { AuthUser } from './auth-types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** `last_seen_at` viene aggiornato al massimo una volta ogni 5 minuti. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/** Sessioni server-side: nel cookie un id casuale, in DB solo il suo hash. */
export class SessionService {
  constructor(
    private readonly model: ModelAuth,
    private readonly config: Pick<AuthConfig, 'secureCookies' | 'session'>,
  ) {}

  /** Crea una sessione per l'utente; ritorna il token da mettere nel cookie. */
  async create(userId: number, userAgent: string | null): Promise<CreatedSession> {
    const now = Date.now();
    await this.model.deleteExpiredSessions(userId, this.idleCutoff(now));
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now + this.config.session.ttlDays * DAY_MS);
    await this.model.insertSession({
      id_hash: hashSessionToken(token),
      user_id: userId,
      user_agent: userAgent?.slice(0, 500) ?? null,
      expires_at: expiresAt,
    });
    return { token, expiresAt };
  }

  /** Utente della sessione, o `null` se il token non esiste o la sessione è scaduta. */
  async validate(token: string, now = Date.now()): Promise<AuthUser | null> {
    const idHash = hashSessionToken(token);
    const row = await this.model.findSessionWithUser(idHash);
    if (!row) return null;
    const { session_last_seen_at: lastSeen, session_expires_at: expiresAt, ...user } = row;
    if (expiresAt.getTime() <= now || lastSeen.getTime() < this.idleCutoff(now).getTime()) {
      await this.model.deleteSession(idHash);
      return null;
    }
    if (now - lastSeen.getTime() > TOUCH_INTERVAL_MS) {
      await this.model.touchSession(idHash);
    }
    return user;
  }

  async destroy(token: string): Promise<void> {
    await this.model.deleteSession(hashSessionToken(token));
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

  private idleCutoff(now: number): Date {
    return new Date(now - this.config.session.idleDays * DAY_MS);
  }
}
