import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService, DISABLED, NO_PASSKEY, NOT_RECOGNIZED } from '../src/lib/auth/auth-service.js';
import type { IAppUserRecord } from '../src/lib/auth/auth-types.js';
import type { PasskeyCredentialDto } from '../src/lib/auth/dto.js';
import type { SessionService } from '../src/lib/auth/session-service.js';
import { HttpError } from '../src/lib/http-error.js';
import { ZitadelError, type ZitadelService } from '../src/lib/zitadel.js';
import type { ModelAuth } from '../src/model/auth.model.js';

const status = (code: number, message?: string) => (e: unknown) =>
  e instanceof HttpError && e.status === code && (message === undefined || e.message === message);

const anna = {
  id: 5,
  email: 'anna@example.com',
  idp_user_id: 'z-5',
  disabled_at: null,
} as IAppUserRecord;
const credential = { id: 'c', rawId: 'c', type: 'public-key', response: {} } as PasskeyCredentialDto;

function setup(opts: { users?: IAppUserRecord[]; startError?: Error; finish?: string | Error } = {}) {
  const users = opts.users ?? [anna];
  const calls: string[] = [];
  const model = {
    findUserByEmail: async (email: string) => users.find((u) => u.email === email) ?? null,
    findUserById: async (id: number) => users.find((u) => u.id === id) ?? null,
    touchLogin: async (id: number) => void calls.push(`touch:${id}`),
    findPermissions: async () => ['chat.use'],
  } as unknown as ModelAuth;
  const zitadel = {
    startLogin: async (userId: string) => {
      if (opts.startError) throw opts.startError;
      calls.push(`start:${userId}`);
      return { sessionId: 's-1', options: { challenge: 'abc' } };
    },
    finishLogin: async () => {
      const result = opts.finish ?? 'z-5';
      if (result instanceof Error) throw result;
      return result;
    },
  } as unknown as ZitadelService;
  const sessions = {
    create: async (id: number) => {
      calls.push(`session:${id}`);
      return { token: 't', expiresAt: new Date() };
    },
  } as unknown as SessionService;
  return { service: new AuthService(zitadel, sessions, model), calls };
}

const state = { sessionId: 's-1', userId: 5, expiresAt: Date.now() + 60_000 };

describe('AuthService.startLogin', () => {
  it('utente con account collegato: challenge e stato con la sessione ZITADEL', async () => {
    const { service, calls } = setup();
    const { options, state } = await service.startLogin('anna@example.com', 'ip', 1000);
    assert.deepEqual(options, { challenge: 'abc' });
    assert.deepEqual(state, { sessionId: 's-1', userId: 5, expiresAt: 1000 + 5 * 60_000 });
    assert.deepEqual(calls, ['start:z-5']);
  });

  it('email sconosciuta o senza account ZITADEL: stesso messaggio', async () => {
    const { service } = setup({ users: [{ ...anna, idp_user_id: null }] });
    for (const email of ['nessuno@example.com', 'anna@example.com']) {
      await assert.rejects(service.startLogin(email, 'ip'), status(400, NO_PASSKEY));
    }
  });

  it('nessuna passkey su ZITADEL → stesso messaggio; ZITADEL giù → errore', async () => {
    const noPasskey = setup({ startError: new ZitadelError(400, 'begin login failed', 'WEBAU-4G8sw') });
    await assert.rejects(noPasskey.service.startLogin('anna@example.com', 'ip'), status(400, NO_PASSKEY));
    const down = setup({ startError: new ZitadelError(503, 'unavailable', undefined) });
    await assert.rejects(down.service.startLogin('anna@example.com', 'ip'), status(502));
  });

  it('utente disattivato → 403', async () => {
    const { service } = setup({ users: [{ ...anna, disabled_at: new Date() }] });
    await assert.rejects(service.startLogin('anna@example.com', 'ip'), status(403, DISABLED));
  });

  it('limite di tentativi per IP', async () => {
    const { service } = setup();
    for (let i = 0; i < 30; i++) await service.startLogin('anna@example.com', 'ip', 1000);
    await assert.rejects(service.startLogin('anna@example.com', 'ip', 1000), status(429));
    await service.startLogin('anna@example.com', 'altro-ip', 1000);
  });
});

describe('AuthService.finishLogin', () => {
  it('passkey verificata per lo stesso utente: sessione', async () => {
    const { service, calls } = setup();
    const { user } = await service.finishLogin(state, credential, null);
    assert.equal(user.id, 5);
    assert.deepEqual(user.permissions, ['chat.use']);
    assert.deepEqual(calls, ['touch:5', 'session:5']);
  });

  it('passkey rifiutata da ZITADEL → 401', async () => {
    const { service } = setup({ finish: new ZitadelError(400, 'invalid', undefined) });
    await assert.rejects(service.finishLogin(state, credential, null), status(401, NOT_RECOGNIZED));
  });

  it('la sessione ZITADEL è di un altro utente → 401', async () => {
    const { service } = setup({ finish: 'z-altro' });
    await assert.rejects(service.finishLogin(state, credential, null), status(401));
  });

  it('disattivato nel frattempo → 403, nessuna sessione', async () => {
    const { service, calls } = setup({ users: [{ ...anna, disabled_at: new Date() }] });
    await assert.rejects(service.finishLogin(state, credential, null), status(403));
    assert.deepEqual(calls, []);
  });
});
