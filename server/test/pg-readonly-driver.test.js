import assert from 'node:assert/strict';
import test from 'node:test';
import { formatQueryResultAsCli } from '../lib/pg-readonly-driver.mjs';

test('formatQueryResultAsCli — tabella markdown', () => {
  const out = formatQueryResultAsCli({
    rowCount: 1,
    fields: [{ name: 'id' }, { name: 'nome' }],
    rows: [{ id: 1, nome: 'Aquila' }],
  });
  assert.match(out, /Statement 1 \(1 rows\)/);
  assert.match(out, /\| id \| nome \|/);
  assert.match(out, /Aquila/);
});

test('formatQueryResultAsCli — zero righe', () => {
  const out = formatQueryResultAsCli({
    rowCount: 0,
    fields: [],
    rows: [],
  });
  assert.match(out, /0 rows/);
});
