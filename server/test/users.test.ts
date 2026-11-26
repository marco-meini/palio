import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { AuthUser } from '../src/lib/auth/auth-types.js';
import type { UserInputDto } from '../src/lib/auth/dto.js';
import { HttpError } from '../src/lib/http-error.js';
import { UsersService } from '../src/lib/users/users-service.js';
import { parseUserInput } from '../src/lib/users/users-validation.js';
import type { ZitadelGrant, ZitadelService, ZitadelUser, ZitadelUserInput } from '../src/lib/zitadel.js';
import type { ModelUsers } from '../src/model/users.model.js';

/** ZITADEL finto in memoria: account (condivisi tra app) e accessi al progetto Dimmelo. */
class FakeZitadel {
  users = new Map<string, ZitadelUser>();
  grants = new Map<string, ZitadelGrant>();
  /** account che sanno già entrare (passkey o Google) */
  canLogin = new Set<string>();
  calls: string[] = [];
  private seq = 100;

  addUser(id: string, email: string, roles?: string[], active = true): void {
    this.users.set(id, { userId: id, firstName: id, lastName: 'Test', displayName: `${id} Test`, email });
    if (roles) {
      this.grants.set(id, {
        grantId: `g-${id}`,
        userId: id,
        roleKeys: roles,
        active,
        firstName: id,
        lastName: 'Test',
        displayName: `${id} Test`,
        email,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    }
  }

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }
  async createUser(input: ZitadelUserInput) {
    const id = String(this.seq++);
    this.calls.push(`create:${input.email}`);
    this.users.set(id, { userId: id, ...input });
    return id;
  }
  async updateUser(id: string, input: ZitadelUserInput) {
    this.calls.push(`update:${id}:${input.displayName}:${input.email}`);
    this.users.set(id, { userId: id, ...input });
    const g = this.grants.get(id);
    if (g) this.grants.set(id, { ...g, ...input });
  }
  async passkeyRegistrationLink(id: string) {
    this.calls.push(`link:${id}`);
    return `https://id.example.com/ui/login/login/passwordless/init?userID=${id}`;
  }
  async hasLoginMethod(id: string) {
    return this.canLogin.has(id);
  }
  async listGrants(userId?: string) {
    return [...this.grants.values()].filter((g) => !userId || g.userId === userId);
  }
  async addGrant(id: string, roleKeys: string[]) {
    this.calls.push(`grant:${id}:${roleKeys.join(',')}`);
    const u = this.users.get(id)!;
    this.grants.set(id, {
      grantId: `g-${id}`,
      userId: id,
      roleKeys,
      active: true,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: u.displayName,
      email: u.email,
      createdAt: '2026-11-26T00:00:00.000Z',
    });
  }
  async updateGrant(id: string, _grantId: string, roleKeys: string[]) {
    this.calls.push(`roles:${id}:${roleKeys.join(',')}`);
    this.grants.set(id, { ...this.grants.get(id)!, roleKeys });
  }
  async deactivateGrant(id: string) {
    this.calls.push(`deactivate:${id}`);
    this.grants.set(id, { ...this.grants.get(id)!, active: false });
  }
  async reactivateGrant(id: string) {
    this.calls.push(`reactivate:${id}`);
    this.grants.set(id, { ...this.grants.get(id)!, active: true });
  }
  async removeGrant(id: string) {
    this.calls.push(`remove:${id}`);
    this.grants.delete(id);
  }
}

const ALL = ['chat.use', 'users.view', 'users.manage'];
const actor = (id: string, permissions: string[]): AuthUser => ({
  id: 1,
  idp_user_id: id,
  display_name: id,
  email: null,
  last_login_at: new Date(),
  created_at: new Date(),
  permissions,
});
const input = (over: Partial<UserInputDto> = {}): UserInputDto => ({
  firstName: 'Bruno',
  lastName: 'Verdi',
  email: 'bruno@example.com',
  permissions: ['chat.use'],
  ...over,
});
const rejects = (promise: Promise<unknown>, status: number, message?: RegExp) =>
  assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof HttpError, String(e));
    assert.equal(e.status, status);
    if (message) assert.match(e.message, message);
    return true;
  });

describe('UsersService (accessi su ZITADEL)', () => {
  let zitadel: FakeZitadel;
  let sessionsClosed: string[];
  let service: UsersService;
  const admin = actor('admin', ALL);

  beforeEach(() => {
    zitadel = new FakeZitadel();
    zitadel.addUser('admin', 'admin@example.com', ALL);
    zitadel.addUser('anna', 'anna@example.com', ['chat.use']);
    zitadel.addUser('zoe', 'zoe@example.com', ['users.view'], false);
    sessionsClosed = [];
    const repository = {
      lastLogins: async (ids: string[]) =>
        new Map(ids.filter((id) => id === 'anna').map((id) => [id, new Date('2026-11-01')])),
      deleteSessions: async (id: string) => void sessionsClosed.push(id),
    } as unknown as ModelUsers;
    service = new UsersService(zitadel as unknown as ZitadelService, repository, 'https://app.example.com');
  });

  it('list: stato da grant e ultimo accesso; disattivati in fondo', async () => {
    const users = await service.list();
    assert.deepEqual(
      users.map((u) => [u.id, u.status]),
      [
        ['admin', 'invited'],
        ['anna', 'active'],
        ['zoe', 'disabled'],
      ],
    );
    assert.deepEqual(users[1]?.permissions, ['chat.use']);
  });

  it('create: nuovo account con email verificata, ruoli e link per la passkey', async () => {
    const { user, invite } = await service.create(input(), admin);
    assert.equal(user.email, 'bruno@example.com');
    assert.equal(user.status, 'invited');
    assert.equal(invite.kind, 'passkey');
    assert.ok(invite.url.includes(`userID=${user.id}`));
    assert.deepEqual(zitadel.calls, ['create:bruno@example.com', `grant:${user.id}:chat.use`, `link:${user.id}`]);
  });

  it('create: account già esistente (altra app) collegato, non duplicato', async () => {
    zitadel.addUser('carla', 'carla@example.com');
    const { user } = await service.create(input({ email: 'CARLA@example.com' }), admin);
    assert.equal(user.id, 'carla');
    assert.ok(!zitadel.calls.some((c) => c.startsWith('create:')));
  });

  it('create: chi ha già accesso → 409', async () => {
    await rejects(service.create(input({ email: 'anna@example.com' }), admin), 409, /già accesso/);
  });

  it('si assegnano solo permessi propri', async () => {
    const manager = actor('m', ['users.manage']);
    await rejects(service.create(input({ permissions: ['chat.use'] }), manager), 403);
    await service.create(input({ permissions: ['users.view'] }), manager);
  });

  it('update: nome ed email su ZITADEL, ruoli sul grant', async () => {
    const user = await service.update('anna', input({ email: 'anna@example.com', permissions: ['chat.use', 'users.view'] }), admin);
    assert.deepEqual(user.permissions, ['chat.use', 'users.view']);
    assert.deepEqual(zitadel.calls, ['update:anna:Bruno Verdi:anna@example.com', 'roles:anna:chat.use,users.view']);
  });

  it('update: email di un altro account → 409', async () => {
    await rejects(service.update('anna', input({ email: 'admin@example.com' }), admin), 409, /email/);
  });

  it('nessuno cambia i propri permessi', async () => {
    await rejects(
      service.update('admin', input({ email: 'admin@example.com', permissions: ['chat.use'] }), admin),
      409,
      /tuoi permessi/,
    );
  });

  it('non si gestisce chi ha permessi che non si hanno', async () => {
    await rejects(service.disable('admin', actor('m', ['users.manage'])), 403);
  });

  it('disable: grant disattivato e sessioni chiuse; enable lo riattiva', async () => {
    const disabled = await service.disable('anna', admin);
    assert.equal(disabled.status, 'disabled');
    assert.deepEqual(sessionsClosed, ['anna']);
    assert.equal((await service.enable('anna', admin)).status, 'active');
    assert.deepEqual(zitadel.calls, ['deactivate:anna', 'reactivate:anna']);
  });

  it('remove: toglie solo l’accesso a Dimmelo, l’account resta', async () => {
    await service.remove('anna', admin);
    assert.ok(zitadel.users.has('anna'));
    await rejects(service.get('anna'), 404);
    assert.deepEqual(sessionsClosed, ['anna']);
  });

  it('non si disattiva né elimina se stessi', async () => {
    await rejects(service.disable('admin', admin), 409, /te stesso/);
    await rejects(service.remove('admin', admin), 409, /te stesso/);
  });

  it('deve restare un altro utente attivo che gestisce gli utenti', async () => {
    zitadel.grants.delete('admin');
    zitadel.addUser('capo', 'capo@example.com', ['users.manage']);
    await rejects(service.disable('capo', actor('admin2', ALL)), 409);
    await rejects(service.remove('capo', actor('admin2', ALL)), 409);
    await rejects(service.update('capo', input({ email: 'capo@example.com' }), actor('admin2', ALL)), 409);
    zitadel.addUser('vice', 'vice@example.com', ALL);
    await service.disable('capo', actor('admin2', ALL));
  });

  it('create: account che sa già entrare → link di Dimmelo, nessuna nuova passkey', async () => {
    // es. accesso tolto e ridato: la passkey è rimasta e il browser rifiuterebbe la seconda
    zitadel.addUser('carla', 'carla@example.com');
    zitadel.canLogin.add('carla');
    const { invite } = await service.create(input({ email: 'carla@example.com' }), admin);
    assert.deepEqual(invite, { kind: 'login', url: 'https://app.example.com' });
    assert.ok(!zitadel.calls.some((c) => c.startsWith('link:')));
  });

  it('invito: nuovo link solo per accessi attivi', async () => {
    assert.ok((await service.invite('anna', admin)).url.includes('userID=anna'));
    await rejects(service.invite('zoe', admin), 409, /disattivato/);
    zitadel.canLogin.add('anna');
    assert.equal((await service.invite('anna', admin)).kind, 'login');
  });
});

describe('parseUserInput', () => {
  it('normalizza e filtra i permessi', () => {
    assert.deepEqual(
      parseUserInput({
        firstName: '  Anna ',
        lastName: 'De  Santis',
        email: ' Anna@Example.COM ',
        permissions: ['users.manage', 'chat.use'],
      }),
      { firstName: 'Anna', lastName: 'De Santis', email: 'anna@example.com', permissions: ['chat.use', 'users.manage'] },
    );
  });
  it('errori per campo, almeno un permesso', () => {
    assert.throws(
      () => parseUserInput({ firstName: '', lastName: 'x', email: 'no', permissions: [] }),
      (e: unknown) =>
        e instanceof HttpError &&
        e.status === 400 &&
        Object.keys(e.errors ?? {}).sort().join() === 'email,firstName,permissions',
    );
    assert.throws(() => parseUserInput({ ...input(), permissions: ['sconosciuto'] }));
  });
});
