import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { parseInvite } from '../src/controllers/auth.controller.js';
import { OidcClient } from '../src/lib/auth/oidc-client.js';
import { HttpError } from '../src/lib/http-error.js';

const invite = { userId: 'u1', organization: 'org1', codeId: 'c1', code: 'ABC123' };

describe('Invito con login (Login V2)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const client = () =>
    new OidcClient({
      appUrl: 'https://app.example.com',
      zitadel: { url: 'https://id.example.com', projectId: 'p1', token: undefined, organizationId: 'org1', loginV2: true },
      oidc: { clientId: 'cid', clientSecret: 'secret' },
    });

  it('crea la richiesta di login dal server e la aggancia alla pagina passkey', async () => {
    const requested: { url: string; redirect?: RequestRedirect }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      requested.push({ url, redirect: init?.redirect });
      return new Response(null, { status: 302, headers: { location: '/ui/v2/login/login?authRequest=V2_42' } });
    }) as typeof fetch;
    const url = new URL(await client().invitePasskeyUrl('https://id.example.com/oauth/v2/authorize?state=s', invite));
    assert.deepEqual(requested, [{ url: 'https://id.example.com/oauth/v2/authorize?state=s', redirect: 'manual' }]);
    assert.equal(url.origin + url.pathname, 'https://id.example.com/ui/v2/login/passkey/set');
    assert.deepEqual(Object.fromEntries(url.searchParams), { ...invite, requestId: 'oidc_V2_42' });
  });

  it('ZITADEL non restituisce la richiesta di login → errore di servizio', async () => {
    globalThis.fetch = (async () =>
      new Response('errore', { status: 400 })) as typeof fetch;
    await assert.rejects(client().invitePasskeyUrl('https://id.example.com/oauth/v2/authorize', invite), (e: unknown) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.status, 502);
      return true;
    });
  });

  it('parseInvite: tutti i parametri, solo caratteri ammessi', () => {
    assert.deepEqual(parseInvite({ ...invite }), invite);
    assert.equal(parseInvite({ ...invite, code: undefined }), null);
    assert.equal(parseInvite({ ...invite, code: ['a', 'b'] }), null);
    assert.equal(parseInvite({ ...invite, organization: 'org&x=1' }), null);
    assert.equal(parseInvite({ ...invite, codeId: '' }), null);
  });
});
