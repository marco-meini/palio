/**
 * Full rebuild di contrada_cuffia da palio_partecipazioni.vincitrice.
 */
import type pg from 'pg';
import { computeCuffiaPeriods } from './contrada-cuffia.js';

type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export type RecomputeCuffiaResult = {
  palii: number;
  periods: number;
};

async function withTransaction<T>(
  db: pg.Pool | pg.PoolClient,
  fn: (client: Queryable) => Promise<T>,
): Promise<T> {
  const isPool = typeof (db as pg.Pool).connect === 'function';
  if (isPool) {
    const client = await (db as pg.Pool).connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  await db.query('BEGIN');
  try {
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

export async function recomputeContradaCuffia(
  db: pg.Pool | pg.PoolClient,
): Promise<RecomputeCuffiaResult> {
  const paliiRes = await db.query<{ id: string }>(
    `SELECT id FROM palii ORDER BY data_palio ASC, id ASC`,
  );
  const contradeRes = await db.query<{ id: number }>(
    `SELECT id FROM contrade ORDER BY id ASC`,
  );
  const winsRes = await db.query<{ palio_id: string; contrada_id: number }>(
    `SELECT pp.palio_id, pp.contrada_id
     FROM palio_partecipazioni pp
     WHERE pp.vincitrice = true`,
  );

  const palioIds = paliiRes.rows.map((r) => Number(r.id));
  const contradaIds = contradeRes.rows.map((r) => Number(r.id));
  const winsByPalioId = new Map<number, number>();
  for (const row of winsRes.rows) {
    winsByPalioId.set(Number(row.palio_id), Number(row.contrada_id));
  }

  const periods = computeCuffiaPeriods(palioIds, winsByPalioId, contradaIds);

  await withTransaction(db, async (client) => {
    await client.query('DELETE FROM contrada_cuffia');
    for (const p of periods) {
      await client.query(
        `INSERT INTO contrada_cuffia (contrada_id, palio_id_inizio, palio_id_fine)
         VALUES ($1, $2, $3)`,
        [p.contradaId, p.palioIdInizio, p.palioIdFine],
      );
    }
  });

  return { palii: palioIds.length, periods: periods.length };
}
