import type { Db } from '../lib/db.js';
import type { IAppUserRecord, IUserSessionRecord } from '../lib/auth/auth-types.js';

/** Riga della lookup sessione: utente con i suoi permessi + campi della sessione con prefisso. */
export interface ISessionWithUserRow extends IAppUserRecord {
  permissions: string[];
  session_last_seen_at: Date;
  session_expires_at: Date;
}

/** Utenti, permessi e sessioni per il login. */
export class ModelAuth {
  constructor(private readonly db: Db) {}

  findUserById(id: number): Promise<IAppUserRecord | null> {
    return this.db.queryOne<IAppUserRecord>('SELECT * FROM app_user WHERE id = $1', [id]);
  }

  findUserByEmail(email: string): Promise<IAppUserRecord | null> {
    return this.db.queryOne<IAppUserRecord>(
      'SELECT * FROM app_user WHERE lower(email) = lower($1)',
      [email],
    );
  }

  async findPermissions(userId: number): Promise<string[]> {
    const rows = await this.db.query<{ permission: string }>(
      'SELECT permission FROM user_permission WHERE user_id = $1',
      [userId],
    );
    return rows.map((r) => r.permission);
  }

  async touchLogin(userId: number): Promise<void> {
    await this.db.execute('UPDATE app_user SET last_login_at = now() WHERE id = $1', [userId]);
  }

  async insertSession(
    session: Pick<IUserSessionRecord, 'id_hash' | 'user_id' | 'user_agent' | 'expires_at'>,
  ): Promise<void> {
    await this.db.execute(
      'INSERT INTO user_session (id_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, $4)',
      [session.id_hash, session.user_id, session.user_agent, session.expires_at],
    );
  }

  findSessionWithUser(idHash: string): Promise<ISessionWithUserRow | null> {
    return this.db.queryOne<ISessionWithUserRow>(
      `SELECT u.*,
              ARRAY(SELECT p.permission FROM user_permission p WHERE p.user_id = u.id) AS permissions,
              s.last_seen_at AS session_last_seen_at,
              s.expires_at   AS session_expires_at
         FROM user_session s
         JOIN app_user u ON u.id = s.user_id
        WHERE s.id_hash = $1
          AND u.disabled_at IS NULL`,
      [idHash],
    );
  }

  async touchSession(idHash: string): Promise<void> {
    await this.db.execute('UPDATE user_session SET last_seen_at = now() WHERE id_hash = $1', [
      idHash,
    ]);
  }

  async deleteSession(idHash: string): Promise<void> {
    await this.db.execute('DELETE FROM user_session WHERE id_hash = $1', [idHash]);
  }

  /** Elimina le sessioni scadute (assolute o per inattività) di un utente. */
  async deleteExpiredSessions(userId: number, idleCutoff: Date): Promise<void> {
    await this.db.execute(
      `DELETE FROM user_session
        WHERE user_id = $1
          AND (expires_at < now() OR last_seen_at < $2)`,
      [userId, idleCutoff],
    );
  }
}
