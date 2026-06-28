import pgvector from 'pgvector/pg';
import type { PgClientManager } from './pg-client-manager.js';

export interface RegolamentoChunkInput {
  id: string;
  text: string;
  section: string | null;
  page: number | null;
  embedding: number[];
}

export interface RegolamentoSearchHit {
  id: string;
  text: string;
  section: string | null;
  page: number | null;
  score: number;
}

let vectorTypesRegistered = false;

export async function registerPgvectorTypes(pg: PgClientManager): Promise<void> {
  if (vectorTypesRegistered) return;
  await pg.withClient(async (client) => {
    await pgvector.registerTypes(client);
  });
  vectorTypesRegistered = true;
}

export async function assertPgvectorReady(pg: PgClientManager): Promise<void> {
  const row = await pg.queryReturnFirst<{ extversion: string }>(
    "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
  );
  if (!row?.extversion) {
    throw new Error(
      'Estensione pgvector non installata. Esegui db/bootstrap/03_pgvector.sql come superuser, ' +
        'poi db/migrations/released/regolamento_chunks.sql',
    );
  }
}

export async function replaceRegolamentoChunks(
  pg: PgClientManager,
  params: {
    source: string;
    model: string;
    chunks: RegolamentoChunkInput[];
  },
): Promise<number> {
  await assertPgvectorReady(pg);
  await registerPgvectorTypes(pg);

  const client = await pg.startTransaction();
  try {
    await pg.query('DELETE FROM regolamento_chunks WHERE source = $1', [params.source], client);

    for (const chunk of params.chunks) {
      await pg.query(
        `INSERT INTO regolamento_chunks (
          id, chunk_text, section, page, embedding, model, source
        ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7)`,
        [
          chunk.id,
          chunk.text,
          chunk.section,
          chunk.page,
          pgvector.toSql(chunk.embedding),
          params.model,
          params.source,
        ],
        client,
      );
    }

    await pg.commit(client);
    return params.chunks.length;
  } catch (err) {
    await pg.rollback(client);
    throw err;
  }
}

export async function countRegolamentoChunks(
  pg: PgClientManager,
  source?: string,
): Promise<number> {
  const result = source
    ? await pg.query('SELECT count(*)::int AS n FROM regolamento_chunks WHERE source = $1', [source])
    : await pg.query('SELECT count(*)::int AS n FROM regolamento_chunks');
  return Number(result.rows[0]?.n ?? 0);
}

export async function searchRegolamentoChunks(
  pg: PgClientManager,
  queryEmbedding: number[],
  opts: { topK?: number; minScore?: number } = {},
): Promise<RegolamentoSearchHit[]> {
  await assertPgvectorReady(pg);
  await registerPgvectorTypes(pg);

  const topK = opts.topK ?? 5;
  const minScore = opts.minScore ?? 0.35;
  const vectorSql = pgvector.toSql(queryEmbedding);

  const result = await pg.query(
    `SELECT
      id,
      chunk_text AS text,
      section,
      page,
      1 - (embedding <=> $1::vector) AS score
    FROM regolamento_chunks
    WHERE 1 - (embedding <=> $1::vector) >= $2
    ORDER BY embedding <=> $1::vector
    LIMIT $3`,
    [vectorSql, minScore, topK],
  );

  return (result.rows as Array<{
    id: string;
    text: string;
    section: string | null;
    page: number | null;
    score: number;
  }>).map((row) => ({
    id: row.id,
    text: row.text,
    section: row.section,
    page: row.page,
    score: Number(row.score),
  }));
}

export function buildRegolamentoSearchSql(topK: number, minScore: number): string {
  return `SELECT id, chunk_text AS text, section, page,
       1 - (embedding <=> $1::vector) AS score
FROM regolamento_chunks
WHERE 1 - (embedding <=> $1::vector) >= ${minScore}
ORDER BY embedding <=> $1::vector
LIMIT ${topK}`;
}

/** Reset cache tipi pgvector (solo test). */
export function resetPgvectorTypesCache(): void {
  vectorTypesRegistered = false;
}
