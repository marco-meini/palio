import type { Db } from '../lib/db.js';
import type { IAppUserRecord } from '../lib/auth/auth-types.js';

/** Utente con i permessi assegnati (senza quelli impliciti). */
export type IUserWithPermissionsRow = IAppUserRecord & { permissions: string[] };

export type NewUser = Pick<
  IAppUserRecord,
  'first_name' | 'last_name' | 'display_name' | 'email' | 'phone' | 'is_admin' | 'created_by'
>;
export type UserChanges = Partial<
  Pick<
    IAppUserRecord,
    | 'first_name'
    | 'last_name'
    | 'display_name'
    | 'email'
    | 'phone'
    | 'is_admin'
    | 'disabled_at'
    | 'idp_user_id'
    | 'access_link_hash'
    | 'access_link_expires_at'
  >
>;

/** Colonne aggiornabili: i nomi arrivano solo da qui, mai dall'input. */
const UPDATABLE = new Set<string>([
  'first_name',
  'last_name',
  'display_name',
  'email',
  'phone',
  'is_admin',
  'disabled_at',
  'idp_user_id',
  'access_link_hash',
  'access_link_expires_at',
]);

/** Permessi assegnati, come colonna `permissions` (text[]) della riga di `app_user u`. */
const PERMISSIONS =
  'ARRAY(SELECT p.permission FROM user_permission p WHERE p.user_id = u.id ORDER BY p.permission) AS permissions';

/** Censimento utenti: anagrafica, permessi, link d'accesso. */
export class ModelUsers {
  constructor(private readonly db: Db) {}

  /** Tutti gli utenti con i permessi: prima gli attivi, poi i disattivati, in ordine alfabetico. */
  list(): Promise<IUserWithPermissionsRow[]> {
    return this.db.query<IUserWithPermissionsRow>(
      `SELECT u.*, ${PERMISSIONS} FROM app_user u
        ORDER BY u.disabled_at IS NOT NULL, lower(u.last_name), lower(u.first_name), u.id`,
    );
  }

  findById(id: number): Promise<IAppUserRecord | null> {
    return this.db.queryOne<IAppUserRecord>('SELECT * FROM app_user WHERE id = $1', [id]);
  }

  findWithPermissions(id: number): Promise<IUserWithPermissionsRow | null> {
    return this.db.queryOne<IUserWithPermissionsRow>(
      `SELECT u.*, ${PERMISSIONS} FROM app_user u WHERE u.id = $1`,
      [id],
    );
  }

  /** Sostituisce i permessi assegnati all'utente. */
  async setPermissions(userId: number, permissions: readonly string[]): Promise<void> {
    await this.db.execute(
      'DELETE FROM user_permission WHERE user_id = $1 AND NOT (permission = ANY($2::text[]))',
      [userId, permissions],
    );
    await this.db.execute(
      `INSERT INTO user_permission (user_id, permission)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [userId, permissions],
    );
  }

  findByEmail(email: string): Promise<IAppUserRecord | null> {
    return this.db.queryOne<IAppUserRecord>(
      'SELECT * FROM app_user WHERE lower(email) = lower($1)',
      [email],
    );
  }

  findByIdpUserId(idpUserId: string): Promise<IAppUserRecord | null> {
    return this.db.queryOne<IAppUserRecord>('SELECT * FROM app_user WHERE idp_user_id = $1', [
      idpUserId,
    ]);
  }

  findByAccessLinkHash(hash: string): Promise<IAppUserRecord | null> {
    return this.db.queryOne<IAppUserRecord>('SELECT * FROM app_user WHERE access_link_hash = $1', [
      hash,
    ]);
  }

  async insert(user: NewUser): Promise<IAppUserRecord> {
    const row = await this.db.queryOne<IAppUserRecord>(
      `INSERT INTO app_user (first_name, last_name, display_name, email, phone, is_admin, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        user.first_name,
        user.last_name,
        user.display_name,
        user.email,
        user.phone,
        user.is_admin,
        user.created_by,
      ],
    );
    return row!;
  }

  async update(id: number, changes: UserChanges): Promise<IAppUserRecord> {
    const entries = Object.entries(changes).filter(([, v]) => v !== undefined);
    for (const [column] of entries) {
      if (!UPDATABLE.has(column)) throw new Error(`Colonna non aggiornabile: ${column}`);
    }
    if (entries.length === 0) return (await this.findById(id))!;
    const sets = entries.map(([column], i) => `${column} = $${i + 2}`).join(', ');
    const row = await this.db.queryOne<IAppUserRecord>(
      `UPDATE app_user SET ${sets} WHERE id = $1 RETURNING *`,
      [id, ...entries.map(([, v]) => v)],
    );
    return row!;
  }

  /** Numero di amministratori attivi diversi dall'utente indicato. */
  async countOtherActiveAdmins(excludeId: number): Promise<number> {
    const row = await this.db.queryOne<{ count: number }>(
      `SELECT count(*)::int AS count FROM app_user
        WHERE is_admin AND disabled_at IS NULL AND id <> $1`,
      [excludeId],
    );
    return row?.count ?? 0;
  }

  /** Elimina l'utente: sessioni e permessi se ne vanno con lui. */
  async delete(id: number): Promise<boolean> {
    return (await this.db.execute('DELETE FROM app_user WHERE id = $1', [id])) > 0;
  }

  async deleteSessions(userId: number): Promise<void> {
    await this.db.execute('DELETE FROM user_session WHERE user_id = $1', [userId]);
  }
}
