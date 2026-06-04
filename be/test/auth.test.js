import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {
  createRequireAuth,
  createSessionToken,
  hasGoogleOAuthCredentials,
  maskEmailForDisplay,
  normalizeEmail,
  registerAuth,
  resolveAuthorizedUser,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../server/auth.mjs';

const TEST_SECRET = 'test-secret-at-least-32-characters-long';

/**
 * @param {Record<string, string>} users email → display_name
 */
function createMockPg(users = {}) {
  return {
    async queryReturnFirst(_sql, replacements) {
      const email = /** @type {string} */ (replacements[0]);
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

const disabledAuth = {
  enabled: false,
  sessionSecret: TEST_SECRET,
  sessionTtlSeconds: 3600,
  google: { clientId: '', clientSecret: '' },
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
  assert.equal(user.email, 'user@test.it');
  assert.equal(user.name, 'Test User');
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
  const user = await resolveAuthorizedUser(mockPg, token, enabledAuth);
  assert.ok(user);
  assert.equal(user.name, 'Test User');
});

test('resolveAuthorizedUser — utente non in dimmelo_users', async () => {
  const token = await createSessionToken(
    { email: 'unknown@test.it', name: 'X' },
    TEST_SECRET,
    3600,
  );
  assert.equal(await resolveAuthorizedUser(mockPg, token, enabledAuth), null);
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

test('registerAuth — auth abilitata senza Google OAuth non lancia', async () => {
  const app = Fastify();
  await registerAuth(app, {
    ...enabledAuth,
    google: { clientId: '', clientSecret: '' },
  }, mockPg);

  const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(me.statusCode, 401);

  const google = await app.inject({ method: 'GET', url: '/api/auth/google' });
  assert.equal(google.statusCode, 503);

  await app.close();
});

test('GET /api/auth/me — auth disabilitata', async () => {
  const app = Fastify();
  await registerAuth(app, disabledAuth, mockPg);

  const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { email: null, name: null, authEnabled: false });

  await app.close();
});

test('GET /api/auth/me — 401 senza cookie quando auth abilitata', async () => {
  const app = Fastify();
  await registerAuth(app, enabledAuth, mockPg);

  const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'Non autenticato');

  await app.close();
});

test('GET /api/auth/me — sessione valida quando auth abilitata', async () => {
  const app = Fastify();
  await registerAuth(app, enabledAuth, mockPg);
  const token = await createSessionToken(
    { email: 'user@test.it', name: 'Ignored' },
    TEST_SECRET,
    3600,
  );

  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { [SESSION_COOKIE_NAME]: token },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    email: 'user@test.it',
    name: 'Test User',
    authEnabled: true,
  });

  await app.close();
});

test('requireAuth — 401 senza cookie quando auth abilitata', async () => {
  const app = Fastify();
  const requireAuth = createRequireAuth(enabledAuth, mockPg);

  app.post('/api/chat', { preHandler: requireAuth }, async () => ({ ok: true }));

  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    payload: { messages: [{ role: 'user', content: 'hi' }] },
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'Autenticazione richiesta');

  await app.close();
});
