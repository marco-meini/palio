import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService, NO_ACCESS } from '../src/lib/auth/auth-service.js';
import type { LoginState } from '../src/lib/auth/login-state.js';
import type { OidcIdentity } from '../src/lib/auth/oidc-client.js';
import type { SessionService } from '../src/lib/auth/session-service.js';
import { HttpError } from '../src/lib/http-error.js';
import type { ModelAuth } from '../src/model/auth.model.js';

const identity = (permissions: OidcIdentity['permissions']): OidcIdentity => ({
  idpUserId: 'z-1',
  displayName: 'Anna Rossi',
  email: 'anna@example.com',
  permissions,
  refreshToken: 'rt',
  idToken: 'idt',
});

function setup(permissions: OidcIdentity['permissions'] = ['chat.use']) {
  const calls: unknown[][] = [];
  const oidc = {
    authorizationUrl: async (p: { state: string; nonce: string; codeVerifier: string; selectAccount?: boolean }) => {
      calls.push(['authorize', p]);
      return `https://id.example.com/oauth/v2/authorize?state=${p.state}${p.selectAccount ? '&prompt=select_account' : ''}`;
    },
    exchange: async (query: string, expected: LoginState) => {
      calls.push(['exchange', query, expected.state]);
      return identity(permissions);
    },
    endSessionUrl: async (idToken: string | null) => `https://id.example.com/end?hint=${idToken}`,
    invitePasskeyUrl: async (authorizationUrl: string, invite: { code: string }) => {
      calls.push(['invite', authorizationUrl, invite.code]);
      return `https://id.example.com/ui/v2/login/passkey/set?code=${invite.code}`;
    },
  };
  const sessions = {
    create: async (userId: number, ua: string | null, id: OidcIdentity) => {
      calls.push(['session', userId, ua, id.permissions]);
      return { token: 'tok', expiresAt: new Date(0) };
    },
    destroy: async (token: string) => {
      calls.push(['destroy', token]);
      return 'idt-sessione';
    },
  } as unknown as SessionService;
  const model = {
    upsertUser: async (u: { idp_user_id: string; display_name: string; email: string | null }) => {
      calls.push(['upsert', u]);
      return { id: 7, ...u, last_login_at: new Date(), created_at: new Date() };
    },
  } as unknown as ModelAuth;
  return { service: new AuthService(oidc, sessions, model), calls };
}

const state: LoginState = {
  state: 's',
  nonce: 'n',
  codeVerifier: 'v',
  returnTo: '/utenti',
  expiresAt: Date.now() + 60_000,
};

describe('AuthService', () => {
  it('startLogin: stato casuale, PKCE e returnTo solo interno', async () => {
    const { service } = setup();
    const a = await service.startLogin('/utenti');
    const b = await service.startLogin('https://evil.com');
    assert.equal(a.state.returnTo, '/utenti');
    assert.equal(b.state.returnTo, '/');
    assert.notEqual(a.state.state, b.state.state);
    assert.notEqual(a.state.nonce, b.state.nonce);
    assert.ok(a.state.codeVerifier.length >= 43);
    assert.ok(a.url.includes(`state=${a.state.state}`));
    assert.ok(!a.url.includes('prompt='));
    assert.ok((await service.startLogin('/', true)).url.includes('prompt=select_account'));
  });

  it('startInvite: login con stato nuovo agganciato alla pagina passkey, ritorno alla home', async () => {
    const { service, calls } = setup();
    const { url, state } = await service.startInvite({ userId: 'u1', organization: 'o1', codeId: 'c1', code: 'K' });
    assert.equal(url, 'https://id.example.com/ui/v2/login/passkey/set?code=K');
    assert.equal(state.returnTo, '/');
    assert.deepEqual(calls.at(-1), ['invite', `https://id.example.com/oauth/v2/authorize?state=${state.state}`, 'K']);
  });

  it('finishLogin: profilo aggiornato e sessione con i permessi del token', async () => {
    const { service, calls } = setup(['chat.use', 'users.view']);
    const signedIn = await service.finishLogin('code=c&state=s', state, 'Firefox');
    assert.equal(signedIn.returnTo, '/utenti');
    assert.deepEqual(signedIn.user.permissions, ['chat.use', 'users.view']);
    assert.deepEqual(calls, [
      ['exchange', 'code=c&state=s', 's'],
      ['upsert', { idp_user_id: 'z-1', display_name: 'Anna Rossi', email: 'anna@example.com' }],
      ['session', 7, 'Firefox', ['chat.use', 'users.view']],
    ]);
  });

  it('finishLogin senza ruoli sul progetto: 403, nessuna sessione', async () => {
    const { service, calls } = setup([]);
    await assert.rejects(
      service.finishLogin('code=c', state, null),
      (e: unknown) => e instanceof HttpError && e.status === 403 && e.message === NO_ACCESS,
    );
    assert.ok(!calls.some((c) => c[0] === 'session'));
  });

  it('logout: chiude la sessione e usa il suo ID token per uscire da ZITADEL', async () => {
    const { service, calls } = setup();
    assert.equal(await service.logout('tok'), 'https://id.example.com/end?hint=idt-sessione');
    assert.deepEqual(calls, [['destroy', 'tok']]);
    assert.equal(await service.logout(undefined), 'https://id.example.com/end?hint=null');
  });
});
