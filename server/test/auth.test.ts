import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSessionToken,
  hasGoogleOAuthCredentials,
  maskEmailForDisplay,
  normalizeEmail,
  resolveAuthorizedUser,
  verifySessionToken,
} from '../src/lib/auth/session.js';

const TEST_SECRET = 'test-secret-at-least-32-characters-long';

function createMockPg(users: Record<string, string> = {}) {
  return {
    async queryReturnFirst(_sql: string, replacements: unknown[]) {
      const email = replacements[0] as string;
      const displayName = users[email];
      if (!displayName) return null;
      return {
        id: 1,
        email,
        display_name: displayName,
        created_at: new Date(),
      };
    },
  };
}

const mockPg = createMockPg({ 'user@test.it': 'Test User' });

const enabledAuth = {
  enabled: true,
  sessionSecret: TEST_SECRET,
  sessionTtlSeconds: 3600,
  google: { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
  publicApiUrl: 'http://localhost:3001',
  publicAppUrl: 'http://localhost:4200',
};

test('normalizeEmail — lowercase e trim', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});

test('maskEmailForDisplay — maschera dominio', () => {
  assert.equal(maskEmailForDisplay('User@Example.COM'), 'user@***');
  assert.equal(maskEmailForDisplay(''), '');
});

test('session JWT — create e verify', async () => {
  const token = await createSessionToken(
    { email: 'user@test.it', name: 'Test User' },
    TEST_SECRET,
    3600,
  );
  const user = await verifySessionToken(token, TEST_SECRET);
  assert.ok(user);
  assert.equal(user!.email, 'user@test.it');
  assert.equal(user!.name, 'Test User');
});

test('session JWT — token invalido', async () => {
  assert.equal(await verifySessionToken('not-a-jwt', TEST_SECRET), null);
});

test('verifySessionToken — rifiuta secret errato', async () => {
  const token = await createSessionToken(
    { email: 'user@test.it', name: 'Test' },
    TEST_SECRET,
    3600,
  );
  assert.equal(await verifySessionToken(token, 'wrong-secret-at-least-32-characters'), null);
});

test('resolveAuthorizedUser — display_name da database', async () => {
  const token = await createSessionToken(
    { email: 'user@test.it', name: 'JWT only' },
    TEST_SECRET,
    3600,
  );
  const user = await resolveAuthorizedUser(mockPg as any, token, enabledAuth);
  assert.ok(user);
  assert.equal(user!.name, 'Test User');
});

test('resolveAuthorizedUser — utente non in dimmelo_users', async () => {
  const token = await createSessionToken(
    { email: 'unknown@test.it', name: 'X' },
    TEST_SECRET,
    3600,
  );
  assert.equal(await resolveAuthorizedUser(mockPg as any, token, enabledAuth), null);
});

test('hasGoogleOAuthCredentials — rifiuta vuoto e placeholder', () => {
  assert.equal(hasGoogleOAuthCredentials({ clientId: '', clientSecret: 'x' }), false);
  assert.equal(
    hasGoogleOAuthCredentials({
      clientId: 'REPLACE_WITH_GOOGLE_CLIENT_ID',
      clientSecret: 'REPLACE_WITH_GOOGLE_CLIENT_SECRET',
    }),
    false,
  );
  assert.equal(
    hasGoogleOAuthCredentials({ clientId: 'real-id', clientSecret: 'real-secret' }),
    true,
  );
});
