import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { AuthService } from '../src/lib/auth/auth-service.js';
import type { IAppUserRecord } from '../src/lib/auth/auth-types.js';
import type { PasskeyCredentialDto } from '../src/lib/auth/dto.js';
import { RateLimiter } from '../src/lib/auth/rate-limiter.js';
import { HttpError } from '../src/lib/http-error.js';
import type { MailMessage, MailService } from '../src/lib/mail.js';
import { AccountsService } from '../src/lib/users/accounts-service.js';
import { InvitesService } from '../src/lib/users/invites-service.js';
import { RecoveryService } from '../src/lib/users/recovery-service.js';
import { ZitadelError, type ZitadelService, type ZitadelUser } from '../src/lib/zitadel.js';
import type { ModelUsers, UserChanges } from '../src/model/users.model.js';

const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

const credential = { id: 'c', rawId: 'c', type: 'public-key', response: {} } as PasskeyCredentialDto;

describe('InvitesService e AccountsService', () => {
  let users: Map<number, IAppUserRecord>;
  let zitadelUsers: (ZitadelUser & { email: string })[];
  let calls: string[];
  let finishError: Error | null;
  let service: InvitesService;

  beforeEach(() => {
    users = new Map([
      [
        7,
        {
          id: 7,
          first_name: 'Pippo',
          last_name: 'Rossi',
          display_name: 'Pippo Rossi',
          email: 'pippo@example.com',
          idp_user_id: null,
          disabled_at: null,
        } as IAppUserRecord,
      ],
      [
        8,
        { id: 8, email: 'altro@example.com', idp_user_id: 'z-shared', disabled_at: null } as IAppUserRecord,
      ],
    ]);
    zitadelUsers = [];
    calls = [];
    finishError = null;
    const repository = {
      findByAccessLinkHash: async (hash: string) =>
        [...users.values()].find((u) => u.access_link_hash === hash) ?? null,
      findByIdpUserId: async (id: string) => [...users.values()].find((u) => u.idp_user_id === id) ?? null,
      update: async (id: number, changes: UserChanges) => {
        const row = { ...users.get(id)!, ...changes } as IAppUserRecord;
        users.set(id, row);
        return row;
      },
    } as unknown as ModelUsers;
    const zitadel = {
      findUserByEmail: async (email: string) => zitadelUsers.find((u) => u.email === email) ?? null,
      createUser: async (input: { email: string }) => {
        calls.push(`create:${input.email}`);
        return 'z-new';
      },
      startPasskeyRegistration: async (id: string) => {
        calls.push(`register:${id}`);
        return { passkeyId: 'pk-1', options: { challenge: 'abc' } };
      },
      finishPasskeyRegistration: async (id: string, passkeyId: string) => {
        if (finishError) throw finishError;
        calls.push(`verify:${id}:${passkeyId}`);
      },
    } as unknown as ZitadelService;
    const auth = {
      signIn: async (user: IAppUserRecord) => {
        calls.push(`signIn:${user.id}`);
        return { user, session: { token: 't', expiresAt: new Date() } };
      },
    } as unknown as AuthService;
    const config = { appUrl: 'http://app', accessLinks: { inviteTtlHours: 1, recoveryTtlMinutes: 60 } };
    service = new InvitesService(config, repository, new AccountsService(repository, zitadel), zitadel, auth);
  });

  const issue = async (id = 7) => (await service.issue(users.get(id)!)).url.split('/invito/')[1]!;

  it('il link porta a palio; in DB solo l’hash del token', async () => {
    const token = await issue();
    assert.match(token, /^[\w-]{43}$/);
    assert.notEqual(users.get(7)!.access_link_hash, token);
    const result = await service.status(token);
    assert.equal(result.firstName, 'Pippo');
    assert.equal(result.email, 'pippo@example.com');
  });

  it('un nuovo link sostituisce il precedente', async () => {
    const first = await issue();
    await issue();
    await assert.rejects(service.status(first), status(404));
  });

  it('scaduto → 410, sconosciuto → 404', async () => {
    const token = await issue();
    await assert.rejects(service.status(token, Date.now() + 2 * 3_600_000), status(410));
    await assert.rejects(service.status('sconosciuto'), status(404));
  });

  it('crea l’account ZITADEL, la passkey, consuma il link ed entra', async () => {
    const token = await issue();
    const start = await service.startPasskey(token);
    assert.deepEqual(start, { passkeyId: 'pk-1', options: { challenge: 'abc' } });
    assert.equal(users.get(7)!.idp_user_id, 'z-new');
    // un secondo tentativo (Face ID annullato) non crea un altro account
    await service.startPasskey(token);
    await service.finishPasskey(token, 'pk-1', credential, null);
    assert.deepEqual(calls, [
      'create:pippo@example.com',
      'register:z-new',
      'register:z-new',
      'verify:z-new:pk-1',
      'signIn:7',
    ]);
    assert.equal(users.get(7)!.access_link_hash, null);
    await assert.rejects(service.status(token), status(404));
  });

  it('collega l’account ZITADEL esistente con la stessa email (identità condivisa)', async () => {
    zitadelUsers = [{ userId: 'z-esistente', email: 'pippo@example.com' }];
    await service.startPasskey(await issue());
    assert.equal(users.get(7)!.idp_user_id, 'z-esistente');
    assert.deepEqual(calls, ['register:z-esistente']);
  });

  it('account ZITADEL già collegato a un altro utente → 409', async () => {
    zitadelUsers = [{ userId: 'z-shared', email: 'pippo@example.com' }];
    await assert.rejects(service.startPasskey(await issue()), status(409));
  });

  it('passkey rifiutata: il link resta valido per riprovare', async () => {
    const token = await issue();
    await service.startPasskey(token);
    finishError = new ZitadelError(400, 'invalid', undefined);
    await assert.rejects(service.finishPasskey(token, 'pk-1', credential, null), status(400));
    assert.ok((await service.status(token)).firstName);
  });

  it('utente disattivato: il link non vale', async () => {
    const token = await issue();
    users.set(7, { ...users.get(7)!, disabled_at: new Date() });
    await assert.rejects(service.status(token), status(404));
  });
});

describe('RateLimiter', () => {
  it('blocca oltre il limite e riapre dopo la finestra', () => {
    const limiter = new RateLimiter(2, 1000);
    assert.equal(limiter.hit('a', 0), true);
    assert.equal(limiter.hit('a', 10), true);
    assert.equal(limiter.hit('a', 20), false);
    assert.equal(limiter.hit('b', 20), true);
    assert.equal(limiter.hit('a', 1011), true);
  });
});

describe('RecoveryService', () => {
  const users = [
    { id: 1, email: 'anna@example.com', first_name: 'Anna', disabled_at: null },
    { id: 2, email: 'ex@example.com', first_name: 'Ex', disabled_at: new Date() },
  ] as IAppUserRecord[];

  const setup = () => {
    const sent: MailMessage[] = [];
    const ttls: number[] = [];
    const service = new RecoveryService(
      { accessLinks: { inviteTtlHours: 72, recoveryTtlMinutes: 60 } },
      { findByEmail: async (e: string) => users.find((u) => u.email === e) ?? null } as unknown as ModelUsers,
      {
        issue: async (_u: IAppUserRecord, ttl: number) => {
          ttls.push(ttl);
          return { url: 'http://app/invito/ref', expiresAt: '2026-11-18T10:00:00Z' };
        },
      } as unknown as InvitesService,
      { send: async (m: MailMessage) => void sent.push(m) } as unknown as MailService,
    );
    return { service, sent, ttls };
  };

  it('manda il link solo a utenti censiti e attivi', async () => {
    const { service, sent, ttls } = setup();
    assert.equal(await service.send('anna@example.com'), true);
    assert.equal(await service.send('ex@example.com'), false);
    assert.equal(await service.send('nessuno@example.com'), false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, 'anna@example.com');
    assert.equal(sent[0]!.subject, 'Accedi a Dimmelo');
    assert.match(sent[0]!.text, /http:\/\/app\/invito\/ref/);
    assert.match(sent[0]!.html, /Ciao Anna/);
    assert.deepEqual(ttls, [60]);
  });

  it('limite per indirizzo: oltre 3 richieste l’ora non manda altro', async () => {
    const { service, sent } = setup();
    for (let i = 0; i < 5; i++) service.request('anna@example.com', `10.0.0.${i}`);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(sent.length, 3);
  });
});
