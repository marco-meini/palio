import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactToolResult,
  parseCliTable,
  toMarkdownTable,
} from '../lib/compact-tool-result.mjs';
import {
  buildRecipeSql,
  RECIPE_NAMES,
  validateRecipeParams,
} from '../lib/palio-recipes.mjs';

const SAMPLE_CLI = `Statement 1 (3 rows)
┌────┬────────────┐
│ id ┆ name       │
╞════╪════════════╡
│ 1  ┆ Aquila     │
├╌╌╌╌┼╌╌╌╌╌╌╌╌╌╌╌╌┤
│ 2  ┆ Bruco      │
├╌╌╌╌┼╌╌╌╌╌╌╌╌╌╌╌╌┤
│ 3  ┆ Chiocciola │
└────┴────────────┘`;

test('parseCliTable — estrae header e righe', () => {
  const parsed = parseCliTable(SAMPLE_CLI);
  assert.ok(parsed);
  assert.deepEqual(parsed.headers, ['id', 'name']);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.rows[0], ['1', 'Aquila']);
});

test('toMarkdownTable — formato markdown', () => {
  const md = toMarkdownTable(['a', 'b'], [['1', 'x']]);
  assert.match(md, /^\| a \| b \|/m);
  assert.match(md, /^\| --- \| --- \|/m);
  assert.match(md, /^\| 1 \| x \|/m);
});

test('compactToolResult — cap righe e nota troncamento', () => {
  const out = compactToolResult(SAMPLE_CLI, { enabled: true, maxRows: 2 });
  assert.match(out, /Statement 1 \(3 rows\)/);
  assert.match(out, /\| id \| name \|/);
  assert.match(out, /\| 1 \| Aquila \|/);
  assert.match(out, /\| 2 \| Bruco \|/);
  assert.doesNotMatch(out, /Chiocciola/);
  assert.match(out, /3 righe totali, mostrate 2/);
});

test('compactToolResult — disabilitato restituisce output originale', () => {
  assert.equal(compactToolResult(SAMPLE_CLI, { enabled: false }), SAMPLE_CLI);
});

test('compactToolResult — testo non tabellare invariato', () => {
  const plain = 'Connessione OK\nNessuna tabella';
  assert.equal(compactToolResult(plain), plain);
});

test('validateRecipeParams — ricetta sconosciuta', () => {
  assert.throws(
    () => validateRecipeParams('unknown_recipe'),
    /Ricetta sconosciuta/,
  );
});

test('validateRecipeParams — wins_by_contrada richiede contrada', () => {
  assert.throws(
    () => validateRecipeParams('wins_by_contrada', {}),
    /contrada/i,
  );
  assert.doesNotThrow(() =>
    validateRecipeParams('wins_by_contrada', { contrada: 'Oca' }),
  );
  assert.doesNotThrow(() =>
    validateRecipeParams('wins_by_contrada', { contrada_id: 5 }),
  );
});

test('validateRecipeParams — palio_participants richiede source_code o data', () => {
  assert.throws(
    () => validateRecipeParams('palio_participants', {}),
    /source_code o data_palio/,
  );
  assert.throws(
    () => validateRecipeParams('palio_participants', { source_code: 'abc' }),
    /9 cifre/,
  );
  assert.doesNotThrow(() =>
    validateRecipeParams('palio_participants', { source_code: '202507020' }),
  );
  assert.doesNotThrow(() =>
    validateRecipeParams('palio_participants', { data_palio: '2025-07-02' }),
  );
});

test('validateRecipeParams — same_horse senza parametri', () => {
  assert.doesNotThrow(() => validateRecipeParams('same_horse_consecutive_cross_year'));
});

test('buildRecipeSql — SQL read-only con parametri validati', () => {
  const sql = buildRecipeSql('last_win', { contrada: 'Selva' });
  assert.match(sql, /^SELECT/i);
  assert.match(sql, /c\.name ILIKE 'Selva'/);
  assert.match(sql, /AS fantino/);
  assert.match(sql, /fantino_soprannome/);
  assert.match(sql, /LIMIT 1/);

  const byId = buildRecipeSql('wins_by_contrada', {
    contrada_id: 7,
    yearFrom: 1900,
    yearTo: 2000,
  });
  assert.match(byId, /c\.id = 7/);
  assert.match(byId, />= 1900/);
  assert.match(byId, /<= 2000/);

  const participants = buildRecipeSql('palio_participants', {
    source_code: '201708160',
  });
  assert.match(participants, /source_code = '201708160'/);
  assert.match(participants, /pp\.estratta/);
  assert.match(participants, /estratta_da/);
  assert.match(participants, /AS fantino/);

  const crossYear = buildRecipeSql('same_horse_consecutive_cross_year');
  assert.match(crossYear, /prev\.anno <> curr\.anno/);

  const byYearSnake = buildRecipeSql('wins_by_contrada', {
    contrada: 'Oca',
    year_from: 2000,
    year_to: 2025,
  });
  assert.match(byYearSnake, />= 2000/);
  assert.match(byYearSnake, /<= 2025/);
});

test('RECIPE_NAMES — copre tutte le ricette previste', () => {
  assert.deepEqual(RECIPE_NAMES, [
    'same_horse_consecutive_cross_year',
    'wins_by_contrada',
    'last_win',
    'palio_participants',
  ]);
});
