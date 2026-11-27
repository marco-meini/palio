import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findSameDatePalio } from '../src/lib/palio-same-date.js';

describe('Scrape: Palio con la stessa data', () => {
  it('trova un altro codice con stessa data e tipo', async () => {
    const calls: unknown[][] = [];
    const db = {
      query: async (_sql: string, params: unknown[]) => {
        calls.push(params);
        return { rows: [{ id: '1692', source_code: '202607020' }] };
      },
    };
    const found = await findSameDatePalio(db, { sourceCode: '202607030', dataPalio: '2026-07-03', straordinario: false });
    assert.deepEqual(found, { id: 1692, sourceCode: '202607020' });
    assert.deepEqual(calls[0], ['2026-07-03', false, '202607030']);
  });

  it('nessun altro Palio quel giorno → null', async () => {
    const db = { query: async () => ({ rows: [] }) };
    assert.equal(
      await findSameDatePalio(db, { sourceCode: '202608160', dataPalio: '2026-08-16', straordinario: false }),
      null,
    );
  });
});
