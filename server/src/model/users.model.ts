import type { Db } from '../lib/db.js';

/**
 * Dati locali degli utenti per la pagina Utenti: chi è già entrato (e quando) e chiusura delle
 * sessioni. Anagrafica e permessi stanno su ZITADEL.
 */
export class ModelUsers {
  constructor(private readonly db: Db) {}

  /** Ultimo accesso per id ZITADEL (solo per chi è entrato almeno una volta). */
  async lastLogins(idpUserIds: readonly string[]): Promise<Map<string, Date>> {
    if (idpUserIds.length === 0) return new Map();
    const rows = await this.db.query<{ idp_user_id: string; last_login_at: Date }>(
      'SELECT idp_user_id, last_login_at FROM app_user WHERE idp_user_id = ANY($1::text[])',
      [idpUserIds],
    );
    return new Map(rows.map((r) => [r.idp_user_id, r.last_login_at]));
  }

  /** Chiude subito tutte le sessioni dell'utente (es. accesso disattivato o tolto). */
  async deleteSessions(idpUserId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM user_session
        WHERE user_id IN (SELECT id FROM app_user WHERE idp_user_id = $1)`,
      [idpUserId],
    );
  }
}
