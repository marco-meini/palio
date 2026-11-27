/** Esecutore minimo di query (pg.Client, pg.Pool o un finto nei test). */
interface Queryable {
  query(sql: string, params: unknown[]): Promise<{ rows: { id: string | number; source_code: string }[] }>;
}

/**
 * Palio già in archivio con la stessa data e lo stesso tipo (ordinario/straordinario) ma un altro
 * codice del sito: di solito è lo stesso Palio importato due volte con codici diversi (es. il
 * luglio 2026, rinviato al 3: `202607020` e `202607030`). `null` se non c'è.
 */
export async function findSameDatePalio(
  db: Queryable,
  palio: { sourceCode: string; dataPalio: string; straordinario: boolean },
): Promise<{ id: number; sourceCode: string } | null> {
  const { rows } = await db.query(
    `SELECT id, source_code
       FROM palii
      WHERE data_palio = $1::date AND straordinario = $2 AND source_code <> $3
      ORDER BY id
      LIMIT 1`,
    [palio.dataPalio, palio.straordinario, palio.sourceCode],
  );
  const row = rows[0];
  return row ? { id: Number(row.id), sourceCode: row.source_code } : null;
}
