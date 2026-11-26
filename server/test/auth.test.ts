import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import cookieParser from 'cookie-parser';
import express, { json } from 'express';
import { createAuthGuard, currentUser } from '../src/lib/auth/auth-guard.js';
import type { AuthUser } from '../src/lib/auth/auth-types.js';
import {
  decodeLoginState,
  encodeLoginState,
  type LoginState,
  safeReturnTo,
} from '../src/lib/auth/login-state.js';
import { type OidcIdentity, RefreshRejectedError, rolesFromClaims } from '../src/lib/auth/oidc-client.js';
import { effectivePermissions, hasPermissions, PERMISSION_CATALOG } from '../src/lib/auth/permissions.js';
import { hashSessionToken, SessionService } from '../src/lib/auth/session-service.js';
import { TokenCrypto } from '../src/lib/auth/token-crypto.js';
import { errorHandler } from '../src/lib/http-error.js';
import type { ISessionWithUserRow, ModelAuth } from '../src/model/auth.model.js';

const APP_URL = 'https://palio.example.com';
const config = { secureCookies: true, session: { ttlDays: 30, idleDays: 7 } };

const user = (permissions: string[] = []): AuthUser => ({
  id: 1,
  idp_user_id: 'z-1',
  display_name: 'Anna Rossi',
  email: 'a@b.c',
  last_login_at: new Date(),
  created_at: new Date(),
  permissions,
});
const ALL = ['chat.use', 'users.view', 'users.manage'];

describe('permessi', () => {
  it('modificare comprende vedere; ruoli sconosciuti ignorati', () => {
    assert.deepEqual(effectivePermissions(['users.manage']), ['users.view', 'users.manage']);
    assert.deepEqual(effectivePermissions(['users.view', 'sconosciuto']), ['users.view']);
    assert.deepEqual(effectivePermissions([]), []);
  });
  it('hasPermissions: servono tutti i richiesti', () => {
    assert.equal(hasPermissions({ permissions: ['users.manage'] }, ['users.view']), true);
    assert.equal(hasPermissions({ permissions: ['users.view'] }, ['users.manage']), false);
    assert.equal(hasPermissions({ permissions: ['users.manage'] }, ['chat.use']), false);
    assert.equal(hasPermissions({ permissions: ALL }, ['users.manage', 'chat.use']), true);
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
  const state: LoginState = {
    state: 's',
    nonce: 'n',
    codeVerifier: 'v',
    returnTo: '/utenti',
    expiresAt: Date.now() + 60_000,
  };

  it('round trip con firma valida', () => {
    assert.deepEqual(decodeLoginState(encodeLoginState(state, 'segreto'), 'segreto'), state);
  });
  it('rifiuta firma errata, payload manomesso e stato scaduto', () => {
    const encoded = encodeLoginState(state, 'segreto');
    assert.equal(decodeLoginState(encoded, 'altro-segreto'), null);
    const [, sig] = encoded.split('.');
    const forged = Buffer.from(JSON.stringify({ ...state, returnTo: '//evil.com' })).toString('base64url');
    assert.equal(decodeLoginState(`${forged}.${sig}`, 'segreto'), null);
    assert.equal(decodeLoginState(encoded, 'segreto', state.expiresAt + 1), null);
    assert.equal(decodeLoginState('spazzatura', 'segreto'), null);
  });
  it('returnTo solo verso path interni', () => {
    assert.equal(safeReturnTo('/utenti/12'), '/utenti/12');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '', undefined, 3]) {
      assert.equal(safeReturnTo(bad), '/', String(bad));
    }
  });
});

describe('rolesFromClaims', () => {
  it('ruoli del progetto che sono permessi dell’app', () => {
    const claims = {
      'urn:zitadel:iam:org:project:42:roles': {
        'users.view': { o1: 'meini' },
        'chat.use': { o1: 'meini' },
        altro: { o1: 'meini' },
      },
    };
    assert.deepEqual(rolesFromClaims(claims, '42'), ['chat.use', 'users.view']);
    assert.deepEqual(rolesFromClaims({ 'urn:zitadel:iam:org:project:roles': { 'chat.use': {} } }, '42'), [
      'chat.use',
    ]);
    assert.deepEqual(rolesFromClaims({}, '42'), []);
  });
});

describe('TokenCrypto', () => {
  it('cifra e decifra; altra chiave o dato manomesso → null', () => {
    const crypto = new TokenCrypto('x'.repeat(32));
    const enc = crypto.encrypt('refresh-token');
    assert.notEqual(enc, 'refresh-token');
    assert.equal(crypto.decrypt(enc), 'refresh-token');
    assert.equal(new TokenCrypto('y'.repeat(32)).decrypt(enc), null);
    assert.equal(crypto.decrypt(`${enc.slice(0, -2)}AA`), null);
    assert.equal(crypto.decrypt('spazzatura'), null);
  });
});

describe('SessionService', () => {
  const crypto = new TokenCrypto('x'.repeat(32));
  const now = Date.now();
  const identity = (permissions: string[]): OidcIdentity => ({
    idpUserId: 'z-1',
    displayName: 'Anna Rossi',
    email: 'a@b.c',
    permissions: permissions as OidcIdentity['permissions'],
    refreshToken: 'rt-2',
    idToken: 'idt-2',
  });

  function setup(
    row: Partial<ISessionWithUserRow> | null,
    refresh: (token: string, sub: string) => Promise<OidcIdentity> = async () => identity(['chat.use']),
  ) {
    const calls: string[] = [];
    const model = {
      findSessionWithUser: async (hash: string) => {
        calls.push(`find:${hash}`);
        return row
          ? ({
              ...user(['chat.use']),
              session_refresh_token_enc: crypto.encrypt('rt-1'),
              session_refreshed_at: new Date(now - 60_000),
              session_last_seen_at: new Date(now - 60_000),
              session_expires_at: new Date(now + 86_400_000),
              ...row,
            } as ISessionWithUserRow)
          : null;
      },
      deleteSession: async () => void calls.push('delete'),
      touchSession: async () => void calls.push('touch'),
      postponeRefresh: async () => void calls.push('postpone'),
      updateUserProfile: async () => void calls.push('profile'),
      refreshSession: async (_h: string, c: { permissions: string[]; refresh_token_enc: string | null }) => {
        calls.push(`refresh:${c.permissions.join(',')}:${crypto.decrypt(c.refresh_token_enc!)}`);
      },
    } as unknown as ModelAuth;
    const oidc = {
      refresh: async (token: string, sub: string) => {
        calls.push(`oidc:${token}:${sub}`);
        return refresh(token, sub);
      },
    };
    return { service: new SessionService(model, oidc, crypto, config), calls };
  }

  it('cerca per hash SHA-256, mai per token in chiaro', async () => {
    const { service, calls } = setup(null);
    assert.equal(await service.validate('token-segreto', now), null);
    assert.deepEqual(calls, [`find:${hashSessionToken('token-segreto')}`]);
  });

  it('sessione valida e recente: nessun touch né refresh', async () => {
    const { service, calls } = setup({});
    const found = await service.validate('t', now);
    assert.equal(found?.display_name, 'Anna Rossi');
    assert.deepEqual(found?.permissions, ['chat.use']);
    assert.equal('session_expires_at' in (found ?? {}), false);
    assert.equal('session_refresh_token_enc' in (found ?? {}), false);
    assert.equal(calls.length, 1);
  });

  it('dopo 5 minuti rilegge i permessi da ZITADEL con il refresh token', async () => {
    const { service, calls } = setup(
      { session_refreshed_at: new Date(now - 10 * 60_000) },
      async () => identity(['users.manage']),
    );
    const found = await service.validate('t', now);
    assert.deepEqual(found?.permissions, ['users.manage']);
    assert.ok(calls.includes('oidc:rt-1:z-1'));
    assert.ok(calls.includes('refresh:users.manage:rt-2'));
  });

  it('richieste parallele: un solo refresh', async () => {
    const { service, calls } = setup({ session_refreshed_at: new Date(now - 10 * 60_000) });
    await Promise.all([service.validate('t', now), service.validate('t', now)]);
    assert.equal(calls.filter((c) => c.startsWith('oidc:')).length, 1);
  });

  it('refresh senza più ruoli sul progetto: sessione chiusa', async () => {
    const { service, calls } = setup(
      { session_refreshed_at: new Date(now - 10 * 60_000) },
      async () => identity([]),
    );
    assert.equal(await service.validate('t', now), null);
    assert.ok(calls.includes('delete'));
  });

  it('refresh rifiutato (utente disattivato, token revocato): sessione chiusa', async () => {
    const { service, calls } = setup({ session_refreshed_at: new Date(now - 10 * 60_000) }, async () => {
      throw new RefreshRejectedError('invalid_grant');
    });
    assert.equal(await service.validate('t', now), null);
    assert.ok(calls.includes('delete'));
  });

  it('ZITADEL irraggiungibile: restano i permessi noti, si riprova più tardi', async () => {
    const { service, calls } = setup({ session_refreshed_at: new Date(now - 10 * 60_000) }, async () => {
      throw new Error('rete');
    });
    const found = await service.validate('t', now);
    assert.deepEqual(found?.permissions, ['chat.use']);
    assert.ok(calls.includes('postpone'));
    assert.ok(!calls.includes('delete'));
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
    ['admin', user(ALL)],
    ['viewer', user(['users.view'])],
    ['manager', user(['users.manage'])],
    ['chatter', user(['chat.use'])],
    ['nobody', user()],
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
      res.send({ ok: true, user: (req as { user?: AuthUser }).user?.id ?? null });
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

  it('permesso richiesto: assegnato o implicito', async () => {
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
