import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { ZitadelConfig } from '../src/auth-config.js';
import { ZitadelService } from '../src/lib/zitadel.js';

const config = (loginV2: boolean): ZitadelConfig => ({
  url: 'https://id.example.com',
  projectId: 'p1',
  token: 'pat',
  organizationId: 'org1',
  loginV2,
});

describe('ZitadelService.passkeyRegistrationLink', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const stubCode = () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: { id: 'c1', code: 'SECRET' } }), { status: 200 })) as typeof fetch;
  };

  it('Login V1: pagina passwordless/init (chiede il nome del dispositivo)', async () => {
    stubCode();
    const url = new URL(await new ZitadelService(config(false)).passkeyRegistrationLink('u1'));
    assert.equal(url.pathname, '/ui/login/login/passwordless/init');
    assert.deepEqual(Object.fromEntries(url.searchParams), { userID: 'u1', orgID: 'org1', codeID: 'c1', code: 'SECRET' });
  });

  it('Login V2: pagina passkey/set (nome automatico)', async () => {
    stubCode();
    const url = new URL(await new ZitadelService(config(true)).passkeyRegistrationLink('u1'));
    assert.equal(url.origin + url.pathname, 'https://id.example.com/ui/v2/login/passkey/set');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      userId: 'u1',
      organization: 'org1',
      codeId: 'c1',
      code: 'SECRET',
    });
  });
});
