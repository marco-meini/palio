import assert from 'node:assert/strict';
import test from 'node:test';
import { compactToolResult } from '../src/lib/compact-tool-result.js';

test('compactToolResult — converte tabella CLI in markdown e limita righe', () => {
  const cli = `
Statement 1 (3 rows)
┌────┬───────┐
│ id ┆ name  │
╞════╪═══════╡
│ 1  ┆ Aquila│
├────┼───────┤
│ 2  ┆ Bruco │
├────┼───────┤
│ 3  ┆ Oca   │
└────┴───────┘
`;
  const out = compactToolResult(cli, { maxRows: 2, maxChars: 8000 });
  assert.match(out, /\| id \| name \|/);
  assert.match(out, /Aquila/);
  assert.match(out, /mostrate 2/i);
});

test('compactToolResult — disabled restituisce testo originale', () => {
  const text = 'hello world';
  assert.equal(compactToolResult(text, { enabled: false }), text);
});

test('compactToolResult — tronca per maxChars', () => {
  const text = 'x'.repeat(100);
  const out = compactToolResult(text, { enabled: true, maxChars: 40 });
  assert.match(out, /compattato/i);
  assert.ok(out.length < 100);
});
