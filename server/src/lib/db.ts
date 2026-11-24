import type pg from 'pg';
import type { PgClientManager } from './pg-client-manager.js';

/**
 * Accesso al database per autenticazione e utenti: query tipizzate e transazioni.
 * Dentro `transaction` si usa il `Db` passato alla callback (stessa connessione, stessa
 * transazione); i model lo ricevono nel costruttore.
 */
export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Numero di righe toccate. */
  execute(sql: string, params?: unknown[]): Promise<number>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

type Runner = (sql: string, params: unknown[]) => Promise<pg.QueryResult>;

/** OID di `int8` (bigint): `pg` lo restituisce come stringa. */
const INT8 = 20;

/**
 * Righe con le colonne `bigint` (id, count) come `number` (sicuro fino a 2^53), come in dimora.
 * Solo qui, non con un parser globale: chat, MCP e scraper restano come sono.
 */
export function rowsOf(result: Pick<pg.QueryResult, 'rows' | 'fields'>): Record<string, unknown>[] {
  const int8 = (result.fields ?? []).filter((f) => f.dataTypeID === INT8).map((f) => f.name);
  if (int8.length === 0) return result.rows;
  return result.rows.map((row: Record<string, unknown>) => {
    const out = { ...row };
    for (const name of int8) {
      const value = out[name];
      if (typeof value === 'string') out[name] = Number.parseInt(value, 10);
    }
    return out;
  });
}

function makeDb(run: Runner, transaction: Db['transaction']): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return rowsOf(await run(sql, params)) as T[];
    },
    async queryOne<T>(sql: string, params: unknown[] = []) {
      return (rowsOf(await run(sql, params))[0] as T | undefined) ?? null;
    },
    async execute(sql: string, params: unknown[] = []) {
      return (await run(sql, params)).rowCount ?? 0;
    },
    transaction,
  };
}

export function createDb(pg: PgClientManager): Db {
  const db: Db = makeDb(
    (sql, params) => pg.query(sql, params),
    async (fn) => {
      const client = await pg.startTransaction();
      // transazioni annidate: si riusa quella esterna
      const tx: Db = makeDb(
        (sql, params) => client.query(sql, params),
        (inner) => inner(tx),
      );
      try {
        const result = await fn(tx);
        await pg.commit(client);
        return result;
      } catch (error) {
        await pg.rollback(client);
        throw error;
      }
    },
  );
  return db;
}
