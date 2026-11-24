import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import cookieParser from 'cookie-parser';
import express, { json } from 'express';
import { passkeyRpId } from '../src/auth-config.js';
import { createAuthGuard, currentUser } from '../src/lib/auth/auth-guard.js';
import type { AuthUser } from '../src/lib/auth/auth-types.js';
import { decodeLoginState, encodeLoginState, type LoginState } from '../src/lib/auth/login-state.js';
import { parseCredential, passkeyName } from '../src/lib/auth/passkey-credential.js';
import { effectivePermissions, hasPermissions, PERMISSION_CATALOG } from '../src/lib/auth/permissions.js';
import { hashSessionToken, SessionService } from '../src/lib/auth/session-service.js';
import { errorHandler } from '../src/lib/http-error.js';
import type { ISessionWithUserRow, ModelAuth } from '../src/model/auth.model.js';

const APP_URL = 'https://palio.example.com';
const config = { secureCookies: true, session: { ttlDays: 30, idleDays: 7 } };

const user = (isAdmin = false, permissions: string[] = []): AuthUser => ({
  id: 1,
  idp_user_id: 'z-1',
  first_name: 'Anna',
  last_name: 'Rossi',
  email: 'a@b.c',
  phone: null,
  display_name: 'Anna Rossi',
  is_admin: isAdmin,
  permissions,
  disabled_at: null,
  created_by: null,
  last_login_at: null,
  access_link_hash: null,
  access_link_expires_at: null,
  created_at: new Date(),
  updated_at: new Date(),
});

describe('permessi', () => {
  it('modificare comprende vedere; l’amministratore ha tutto', () => {
    assert.deepEqual(effectivePermissions(false, ['users.manage']), ['users.view', 'users.manage']);
    assert.deepEqual(effectivePermissions(false, ['users.view', 'sconosciuto']), ['users.view']);
    assert.deepEqual(effectivePermissions(true, []), ['chat.use', 'users.view', 'users.manage']);
  });
  it('hasPermissions: servono tutti i richiesti', () => {
    assert.equal(hasPermissions({ is_admin: false, permissions: ['users.manage'] }, ['users.view']), true);
    assert.equal(hasPermissions({ is_admin: false, permissions: ['users.view'] }, ['users.manage']), false);
    assert.equal(hasPermissions({ is_admin: false, permissions: ['users.manage'] }, ['chat.use']), false);
    assert.equal(hasPermissions({ is_admin: true, permissions: [] }, ['users.manage']), true);
  });
  it('catalogo raggruppato per sezione', () => {
    assert.deepEqual(
      PERMISSION_CATALOG.map((s) => [s.key, s.permissions.map((p) => p.key)]),
      [
        ['chat', ['chat.use']],
        ['users', ['users.view', 'users.manage']],
      ],
    );
  });
});

describe('login state', () => {
  const state: LoginState = { sessionId: 's-1', userId: 7, expiresAt: Date.now() + 60_000 };

  it('round trip con firma valida', () => {
    assert.deepEqual(decodeLoginState(encodeLoginState(state, 'segreto'), 'segreto'), state);
  });
  it('rifiuta firma errata, payload manomesso e stato scaduto', () => {
    const encoded = encodeLoginState(state, 'segreto');
    assert.equal(decodeLoginState(encoded, 'altro-segreto'), null);
    const [, sig] = encoded.split('.');
    const forged = Buffer.from(JSON.stringify({ ...state, userId: 1 })).toString('base64url');
    assert.equal(decodeLoginState(`${forged}.${sig}`, 'segreto'), null);
    assert.equal(decodeLoginState(encoded, 'segreto', state.expiresAt + 1), null);
    assert.equal(decodeLoginState('spazzatura', 'segreto'), null);
  });
});

describe('SessionService', () => {
  function setup(row: Partial<ISessionWithUserRow> | null) {
    const calls: string[] = [];
    const model = {
      findSessionWithUser: async (hash: string) => {
        calls.push(`find:${hash}`);
        return row ? ({ ...user(), ...row } as ISessionWithUserRow) : null;
      },
      deleteSession: async () => {
        calls.push('delete');
      },
      touchSession: async () => {
        calls.push('touch');
      },
    } as unknown as ModelAuth;
    return { service: new SessionService(model, config), calls };
  }
  const now = Date.now();

  it('cerca per hash SHA-256, mai per token in chiaro', async () => {
    const { service, calls } = setup(null);
    assert.equal(await service.validate('token-segreto', now), null);
    assert.deepEqual(calls, [`find:${hashSessionToken('token-segreto')}`]);
  });

  it('sessione valida e recente: nessun touch', async () => {
    const { service, calls } = setup({
      session_last_seen_at: new Date(now - 60_000),
      session_expires_at: new Date(now + 86_400_000),
    });
    const found = await service.validate('t', now);
    assert.equal(found?.display_name, 'Anna Rossi');
    assert.equal('session_expires_at' in (found ?? {}), false);
    assert.ok(!calls.includes('touch'));
  });

  it('aggiorna last_seen_at dopo 5 minuti', async () => {
    const { service, calls } = setup({
      session_last_seen_at: new Date(now - 10 * 60_000),
      session_expires_at: new Date(now + 86_400_000),
    });
    assert.ok(await service.validate('t', now));
    assert.ok(calls.includes('touch'));
  });

  it('scaduta (assoluta o per inattività): eliminata', async () => {
    for (const row of [
      { session_last_seen_at: new Date(now), session_expires_at: new Date(now - 1) },
      {
        session_last_seen_at: new Date(now - 8 * 86_400_000),
        session_expires_at: new Date(now + 86_400_000),
      },
    ]) {
      const { service, calls } = setup(row);
      assert.equal(await service.validate('t', now), null);
      assert.ok(calls.includes('delete'));
    }
  });
});

describe('AuthGuard (Express)', () => {
  let base = '';
  let close: () => void;
  const sessions = new Map<string, AuthUser>([
    ['admin', user(true)],
    ['viewer', user(false, ['users.view'])],
    ['manager', user(false, ['users.manage'])],
    ['chatter', user(false, ['chat.use'])],
    ['nobody', user(false)],
  ]);

  before(async () => {
    const guard = createAuthGuard(
      { validate: async (token: string) => sessions.get(token) ?? null } as unknown as SessionService,
      APP_URL,
    );
    const app = express();
    app.use(json());
    app.use(cookieParser());
    const ok = (req: express.Request, res: express.Response) => {
      res.send({ ok: true, user: (req as { user?: AuthUser }).user?.is_admin ?? null });
    };
    app.get('/public', guard.public(), ok);
    app.post('/public', guard.public(), ok);
    app.get('/me', guard.anyUser(), (req, res) => {
      res.send({ name: currentUser(req).display_name });
    });
    app.post('/me', guard.anyUser(), ok);
    app.get('/users', guard.require('users.view'), ok);
    app.post('/users', guard.require('users.manage'), ok);
    app.post('/chat', guard.require('chat.use'), ok);
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        close = () => server.close();
        resolve();
      });
    });
  });
  after(() => close());

  const call = async (
    method: string,
    path: string,
    opts: { session?: string; origin?: string | null } = {},
  ) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.session) headers['cookie'] = `palio_sid=${opts.session}`;
    const origin = opts.origin === undefined ? APP_URL : opts.origin;
    if (origin) headers['origin'] = origin;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : '{}',
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  };

  it('endpoint pubblico senza sessione: ok', async () => {
    assert.equal((await call('GET', '/public')).status, 200);
    assert.equal((await call('POST', '/public')).status, 200);
  });

  it('endpoint protetto senza sessione: 401 con messaggio', async () => {
    const res = await call('GET', '/users');
    assert.equal(res.status, 401);
    assert.equal(res.body?.['message'], 'Autenticazione richiesta');
  });

  it('POST da origin diverso o senza origin: 403 anche se pubblico', async () => {
    assert.equal((await call('POST', '/public', { origin: 'https://evil.com' })).status, 403);
    assert.equal((await call('POST', '/me', { session: 'admin', origin: null })).status, 403);
  });

  it('permesso richiesto: assegnato, implicito o da amministratore', async () => {
    assert.equal((await call('GET', '/users', { session: 'viewer' })).status, 200);
    assert.equal((await call('GET', '/users', { session: 'manager' })).status, 200);
    assert.equal((await call('POST', '/users', { session: 'admin' })).status, 200);
    assert.equal((await call('POST', '/users', { session: 'viewer' })).status, 403);
    assert.equal((await call('GET', '/users', { session: 'nobody' })).status, 403);
  });

  it('la chat richiede chat.use (gestire gli utenti non basta)', async () => {
    assert.equal((await call('POST', '/chat', { session: 'chatter' })).status, 200);
    assert.equal((await call('POST', '/chat', { session: 'manager' })).status, 403);
    assert.equal((await call('POST', '/chat', { session: 'admin' })).status, 200);
  });

  it('anyUser: basta la sessione; sessione sconosciuta = nessuna', async () => {
    const res = await call('GET', '/me', { session: 'nobody' });
    assert.equal(res.status, 200);
    assert.equal(res.body?.['name'], 'Anna Rossi');
    assert.equal((await call('GET', '/me', { session: 'inventata' })).status, 401);
  });

  it('require() senza permessi è un errore di sviluppo', () => {
    const guard = createAuthGuard({} as SessionService, APP_URL);
    assert.throws(() => guard.require());
  });
});

describe('passkeyRpId', () => {
  it('host di APP_URL o un suo dominio padre', () => {
    assert.equal(passkeyRpId('https://palio.example.com', ''), 'palio.example.com');
    assert.equal(passkeyRpId('https://palio.example.com', 'example.com'), 'example.com');
    assert.equal(passkeyRpId('http://localhost:4200', undefined), 'localhost');
    assert.throws(() => passkeyRpId('https://palio.example.com', 'altro.com'));
    assert.throws(() => passkeyRpId('https://palio.example.com', 'ample.com'));
  });
});

describe('parseCredential', () => {
  const valid = {
    id: 'a',
    rawId: 'a',
    type: 'public-key',
    response: { clientDataJSON: 'x', userHandle: null },
  };
  it('accetta la forma attesa e scarta il resto', () => {
    assert.deepEqual(parseCredential({ ...valid, extra: 1 }), valid);
  });
  it('rifiuta forme non valide', () => {
    for (const bad of [
      null,
      {},
      { ...valid, type: 'password' },
      { ...valid, response: [] },
      { ...valid, response: { a: 1 } },
    ]) {
      assert.throws(() => parseCredential(bad), String(JSON.stringify(bad)));
    }
  });
});

describe('passkeyName', () => {
  it('dal browser', () => {
    assert.equal(
      passkeyName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
      'iPhone (Dimmelo)',
    );
    assert.equal(passkeyName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Mac (Dimmelo)');
    assert.equal(passkeyName(null), 'Dispositivo (Dimmelo)');
  });
});

describe('rowsOf (Db)', () => {
  it('bigint (int8) → number, il resto invariato', async () => {
    const { rowsOf } = await import('../src/lib/db.js');
    const rows = rowsOf({
      rows: [{ id: '42', created_by: null, email: 'a@b.c', count: '3' }],
      fields: [
        { name: 'id', dataTypeID: 20 },
        { name: 'created_by', dataTypeID: 20 },
        { name: 'email', dataTypeID: 25 },
        { name: 'count', dataTypeID: 20 },
      ] as never,
    });
    assert.deepEqual(rows, [{ id: 42, created_by: null, email: 'a@b.c', count: 3 }]);
  });
});
