import assert from 'node:assert/strict';
import test from 'node:test';
import { findDimmeloUserByEmail, normalizeEmail } from '../src/lib/dimmelo-users.js';

test('normalizeEmail — lowercase e trim', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});

test('findDimmeloUserByEmail — null se email vuota', async () => {
  const pg = { async queryReturnFirst() { throw new Error('should not query'); } };
  assert.equal(await findDimmeloUserByEmail(pg, ''), null);
});

test('findDimmeloUserByEmail — lookup per email normalizzata', async () => {
  const calls = [];
  const pg = {
    async queryReturnFirst(sql, replacements) {
      calls.push({ sql, replacements });
      if (replacements[0] === 'user@test.it') {
        return {
          id: 1,
          email: 'user@test.it',
          display_name: 'Test User',
          created_at: new Date(),
        };
      }
      return null;
    },
  };

  const row = await findDimmeloUserByEmail(pg, '  User@Test.IT ');
  assert.ok(row);
  assert.equal(row.display_name, 'Test User');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].replacements[0], 'user@test.it');
});

test('findDimmeloUserByEmail — nessuna riga', async () => {
  const pg = { async queryReturnFirst() { return null; } };
  assert.equal(await findDimmeloUserByEmail(pg, 'missing@test.it'), null);
});
