import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { OidcClient } from '../src/lib/auth/oidc-client.js';
import { ZitadelService } from '../src/lib/zitadel.js';

const zitadel = { url: 'https://id.example.com', projectId: 'p1', token: 'pat', organizationId: 'org-dimmelo', loginV2: true };

describe("Organizzazione di Dimmelo su ZITADEL", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('la ricerca per email resta nella sua organizzazione', async () => {
    let body: { queries: unknown[] } | undefined;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ result: [] }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await new ZitadelService(zitadel).findUserByEmail('anna@example.com'), null);
    assert.deepEqual(body?.queries[0], { organizationIdQuery: { organizationId: 'org-dimmelo' } });
  });

  it('il login chiede la sua organizzazione', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          issuer: 'https://id.example.com',
          authorization_endpoint: 'https://id.example.com/oauth/v2/authorize',
          token_endpoint: 'https://id.example.com/oauth/v2/token',
          jwks_uri: 'https://id.example.com/oauth/v2/keys',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;
    const client = new OidcClient({
      appUrl: 'https://app.example.com',
      zitadel,
      oidc: { clientId: 'cid', clientSecret: 'secret' },
    });
    const url = new URL(await client.authorizationUrl({ state: 's', nonce: 'n', codeVerifier: 'v'.repeat(43) }));
    assert.ok(url.searchParams.get('scope')!.split(' ').includes('urn:zitadel:iam:org:id:org-dimmelo'));
  });
});
