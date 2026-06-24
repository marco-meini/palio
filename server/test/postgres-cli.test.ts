import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReadOnlySql,
  splitSqlStatements,
  stripSqlComments,
} from '../src/lib/postgres-cli.js';

test('assertReadOnlySql — consente SELECT, WITH, EXPLAIN', () => {
  assert.doesNotThrow(() => assertReadOnlySql('SELECT 1'));
  assert.doesNotThrow(() =>
    assertReadOnlySql('WITH x AS (SELECT 1 AS n) SELECT n FROM x'),
  );
  assert.doesNotThrow(() =>
    assertReadOnlySql('EXPLAIN SELECT * FROM palii'),
  );
});

test('assertReadOnlySql — rifiuta DML/DDL e migration', () => {
  const forbidden = [
    'DELETE FROM palii',
    'INSERT INTO palii (source_code, data_palio) VALUES (\'x\', \'2025-01-01\')',
    'UPDATE palii SET straordinario = true',
    'DROP TABLE palii',
    'ALTER TABLE palii ADD COLUMN foo text',
    'CREATE TABLE evil (id int)',
    'TRUNCATE palii',
    'GRANT ALL ON palii TO public',
    'REVOKE SELECT ON palii FROM public',
    'SELECT 1; migration release',
  ];

  for (const sql of forbidden) {
    assert.throws(() => assertReadOnlySql(sql), /non consentita/i);
  }
});

test('assertReadOnlySql — rifiuta statement non read-only', () => {
  assert.throws(
    () => assertReadOnlySql('CALL refresh_materialized_views()'),
    /non consentita/i,
  );
});

test('assertReadOnlySql — ignora commenti', () => {
  assert.doesNotThrow(() =>
    assertReadOnlySql(`
      -- DELETE FROM palii
      SELECT id FROM palii
    `),
  );
  assert.throws(
    () =>
      assertReadOnlySql(`
        SELECT 1;
        /* safe */
        DELETE FROM palii
      `),
    /non consentita/i,
  );
});

test('stripSqlComments e splitSqlStatements', () => {
  const sql = `
    SELECT 1; -- trailing
    SELECT 2 /* block */ ;
  `;
  assert.equal(stripSqlComments('SELECT /* x */ 1').trim(), 'SELECT  1');
  assert.deepEqual(splitSqlStatements(sql), ['SELECT 1', 'SELECT 2']);
});
