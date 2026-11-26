import type { Db } from '../lib/db.js';
import type { IAppUserRecord, IUserSessionRecord } from '../lib/auth/auth-types.js';

/** Riga della lookup sessione: utente + campi della sessione con prefisso. */
export interface ISessionWithUserRow extends IAppUserRecord {
  permissions: string[];
  session_refresh_token_enc: string | null;
  session_refreshed_at: Date;
  session_last_seen_at: Date;
  session_expires_at: Date;
}

export type NewSession = Pick<
  IUserSessionRecord,
  'id_hash' | 'user_id' | 'user_agent' | 'permissions' | 'refresh_token_enc' | 'id_token' | 'expires_at'
>;

/** Utenti (profilo da ZITADEL) e sessioni per il login. */
export class ModelAuth {
  constructor(private readonly db: Db) {}

  /** Crea o aggiorna il profilo di chi entra e ne segna l'accesso. */
  async upsertUser(user: Pick<IAppUserRecord, 'idp_user_id' | 'display_name' | 'email'>): Promise<IAppUserRecord> {
    const row = await this.db.queryOne<IAppUserRecord>(
      `INSERT INTO app_user (idp_user_id, display_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (idp_user_id)
       DO UPDATE SET display_name = EXCLUDED.display_name,
                     email = EXCLUDED.email,
                     last_login_at = now()
       RETURNING *`,
      [user.idp_user_id, user.display_name, user.email],
    );
    return row!;
  }

  async updateUserProfile(
    id: number,
    profile: Pick<IAppUserRecord, 'display_name' | 'email'>,
  ): Promise<void> {
    await this.db.execute('UPDATE app_user SET display_name = $2, email = $3 WHERE id = $1', [
      id,
      profile.display_name,
      profile.email,
    ]);
  }

  async insertSession(session: NewSession): Promise<void> {
    await this.db.execute(
      `INSERT INTO user_session
         (id_hash, user_id, user_agent, permissions, refresh_token_enc, id_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id_hash,
        session.user_id,
        session.user_agent,
        session.permissions,
        session.refresh_token_enc,
        session.id_token,
        session.expires_at,
      ],
    );
  }

  findSessionWithUser(idHash: string): Promise<ISessionWithUserRow | null> {
    return this.db.queryOne<ISessionWithUserRow>(
      `SELECT u.*,
              s.permissions,
              s.refresh_token_enc AS session_refresh_token_enc,
              s.refreshed_at      AS session_refreshed_at,
              s.last_seen_at      AS session_last_seen_at,
              s.expires_at        AS session_expires_at
         FROM user_session s
         JOIN app_user u ON u.id = s.user_id
        WHERE s.id_hash = $1`,
      [idHash],
    );
  }

  async findIdToken(idHash: string): Promise<string | null> {
    const row = await this.db.queryOne<{ id_token: string | null }>(
      'SELECT id_token FROM user_session WHERE id_hash = $1',
      [idHash],
    );
    return row?.id_token ?? null;
  }

  /** Permessi e token aggiornati da ZITADEL. */
  async refreshSession(
    idHash: string,
    changes: Pick<IUserSessionRecord, 'permissions' | 'refresh_token_enc' | 'id_token'>,
  ): Promise<void> {
    await this.db.execute(
      `UPDATE user_session
          SET permissions = $2, refresh_token_enc = $3, id_token = coalesce($4, id_token),
              refreshed_at = now(), last_seen_at = now()
        WHERE id_hash = $1`,
      [idHash, changes.permissions, changes.refresh_token_enc, changes.id_token],
    );
  }

  /** Refresh non riuscito per un problema di rete: si riprova al prossimo intervallo. */
  async postponeRefresh(idHash: string): Promise<void> {
    await this.db.execute(
      'UPDATE user_session SET refreshed_at = now(), last_seen_at = now() WHERE id_hash = $1',
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
