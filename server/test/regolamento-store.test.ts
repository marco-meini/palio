import assert from 'node:assert/strict';
import test from 'node:test';
import type { PgClientManager } from '../src/lib/pg-client-manager.js';
import {
  assertPgvectorReady,
  resetPgvectorTypesCache,
  searchRegolamentoChunks,
} from '../src/lib/regolamento-store.js';

test.beforeEach(() => {
  resetPgvectorTypesCache();
});

function mockPg(responses: { vectorExt?: { extversion: string } | null; searchRows?: object[] }) {
  return {
    queryReturnFirst: async (sql: string) => {
      if (sql.includes("extname = 'vector'")) {
        if (Object.prototype.hasOwnProperty.call(responses, 'vectorExt')) {
          return responses.vectorExt;
        }
        return { extversion: '0.7.0' };
      }
      return null;
    },
    withClient: async (fn: (client: {
      query: (sql: string) => Promise<{ rows: object[] }>;
      setTypeParser: () => void;
    }) => Promise<void>) =>
      fn({
        query: async (sql: string) => {
          if (sql.includes('pg_type')) {
            return { rows: [{ typname: 'vector', oid: 16384 }] };
          }
          return { rows: [] };
        },
        setTypeParser: () => {},
      }),
    query: async (sql: string) => {
      if (sql.includes('regolamento_chunks')) {
        return {
          rows: (responses.searchRows as object[]) ?? [
            {
              id: 'chunk-1',
              text: 'La rincorsa al canape.',
              section: 'Art. 1',
              page: 2,
              score: 0.91,
            },
          ],
        };
      }
      return { rows: [] };
    },
  } as unknown as PgClientManager;
}

test('assertPgvectorReady — errore se extension assente', async () => {
  const pg = mockPg({ vectorExt: null });
  await assert.rejects(() => assertPgvectorReady(pg), /pgvector non installata/i);
});

test('searchRegolamentoChunks — query pgvector con score', async () => {
  const pg = mockPg({});
  const hits = await searchRegolamentoChunks(pg, [0.1, 0.2, 0.3], {
    topK: 3,
    minScore: 0.4,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'chunk-1');
  assert.equal(hits[0].score, 0.91);
});
