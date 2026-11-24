import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { AuthUser } from '../src/lib/auth/auth-types.js';
import type { UserInputDto } from '../src/lib/auth/dto.js';
import type { Db } from '../src/lib/db.js';
import { HttpError } from '../src/lib/http-error.js';
import type { AccountsService } from '../src/lib/users/accounts-service.js';
import type { InvitesService } from '../src/lib/users/invites-service.js';
import { userStatus } from '../src/lib/users/users-mapper.js';
import { UsersService } from '../src/lib/users/users-service.js';
import { parseUserInput } from '../src/lib/users/users-validation.js';
import type { ModelUsers } from '../src/model/users.model.js';

const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

const record = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 1,
  idp_user_id: 'z-1',
  first_name: 'Marco',
  last_name: 'Rossi',
  display_name: 'Marco Rossi',
  email: 'marco@example.com',
  phone: null,
  is_admin: true,
  permissions: [],
  disabled_at: null,
  created_by: null,
  last_login_at: new Date(),
  access_link_hash: null,
  access_link_expires_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...over,
});

describe('parseUserInput', () => {
  it('normalizza spazi, email minuscola, telefono vuoto → null', () => {
    assert.deepEqual(
      parseUserInput({
        firstName: '  Anna ',
        lastName: 'De  Luca',
        email: ' Anna@Example.COM ',
        phone: '',
        permissions: ['users.manage', 'chat.use', 'users.view', 'users.view'],
      }),
      {
        firstName: 'Anna',
        lastName: 'De Luca',
        email: 'anna@example.com',
        phone: null,
        isAdmin: false,
        permissions: ['chat.use', 'users.view', 'users.manage'],
      },
    );
  });

  it('errori per campo', () => {
    try {
      parseUserInput({ firstName: '', lastName: 'X', email: 'non-email', phone: 'abc', permissions: ['boss'] });
      assert.fail('doveva fallire');
    } catch (error) {
      assert.ok(error instanceof HttpError && error.status === 400);
      assert.deepEqual(Object.keys(error.errors ?? {}).sort(), ['email', 'firstName', 'permissions', 'phone']);
    }
  });

  it('accetta telefoni con prefisso e separatori', () => {
    assert.equal(
      parseUserInput({ firstName: 'A', lastName: 'B', email: 'a@b.it', phone: '+39 333 123 4567' }).phone,
      '+39 333 123 4567',
    );
  });
});

describe('userStatus', () => {
  it('invited / active / disabled', () => {
    assert.equal(userStatus(record({ last_login_at: null })), 'invited');
    assert.equal(userStatus(record()), 'active');
    assert.equal(userStatus(record({ disabled_at: new Date() })), 'disabled');
  });
});

describe('UsersService', () => {
  const input: UserInputDto = {
    firstName: 'Anna',
    lastName: 'Rossi',
    email: 'anna@example.com',
    phone: null,
    isAdmin: false,
    permissions: ['chat.use'],
  };
  const admin = record();
  /** Gestisce gli utenti senza essere amministratore. */
  const manager = record({
    id: 9,
    email: 'man@example.com',
    is_admin: false,
    permissions: ['users.manage', 'chat.use'],
  });
  let calls: string[];
  let users: Map<number, AuthUser>;
  let service: UsersService;

  beforeEach(() => {
    calls = [];
    users = new Map([
      [admin.id, admin],
      [manager.id, manager],
    ]);
    const repository = {
      findWithPermissions: async (id: number) => users.get(id) ?? null,
      findByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
      insert: async (u: Partial<AuthUser>) => {
        const row = record({ ...u, id: users.size + 100, idp_user_id: null, last_login_at: null });
        users.set(row.id, row);
        return row;
      },
      update: async (id: number, changes: Partial<AuthUser>) => {
        const row = { ...users.get(id)!, ...changes };
        users.set(id, row);
        return row;
      },
      setPermissions: async (id: number, permissions: string[]) => {
        calls.push(`permissions:${id}:${permissions.join(',')}`);
        users.set(id, { ...users.get(id)!, permissions });
      },
      countOtherActiveAdmins: async (id: number) =>
        [...users.values()].filter((u) => u.is_admin && !u.disabled_at && u.id !== id).length,
      deleteSessions: async (id: number) => void calls.push(`deleteSessions:${id}`),
      delete: async (id: number) => {
        calls.push(`delete:${id}`);
        return users.delete(id);
      },
    } as unknown as ModelUsers;
    const accounts = {
      sync: async (u: AuthUser) => void calls.push(`sync:${u.idp_user_id}:${u.first_name}`),
    } as unknown as AccountsService;
    const db = { transaction: <T>(fn: (tx: Db) => Promise<T>) => fn(db) } as unknown as Db;
    const invites = {
      issue: async (u: AuthUser) => ({ url: `http://app/invito/${u.id}`, expiresAt: new Date(0).toISOString() }),
    } as unknown as InvitesService;
    service = new UsersService(db, accounts, invites, () => repository);
  });

  const add = (over: Partial<AuthUser>) => {
    const row = record({ is_admin: false, ...over });
    users.set(row.id, row);
    return row;
  };
  const base: Omit<UserInputDto, 'email'> = {
    firstName: 'Marco',
    lastName: 'Rossi',
    phone: null,
    isAdmin: false,
    permissions: [],
  };

  it('crea utente con i permessi e l’invito, senza toccare ZITADEL', async () => {
    const result = await service.create(input, admin);
    assert.deepEqual(calls, [`permissions:${result.user.id}:chat.use`]);
    assert.equal(result.user.status, 'invited');
    assert.equal(result.user.displayName, 'Anna Rossi');
    assert.deepEqual(result.user.permissions, ['chat.use']);
    assert.equal(users.get(result.user.id)!.idp_user_id, null);
    assert.equal(result.invite.url, `http://app/invito/${result.user.id}`);
  });

  it('email già censita → 409', async () => {
    await assert.rejects(service.create({ ...input, email: admin.email }, admin), status(409));
  });

  it('nessuno cambia i propri permessi, ma può modificare i propri dati', async () => {
    await assert.rejects(
      service.update(admin.id, { ...base, email: admin.email, isAdmin: false }, admin),
      /tuoi permessi/,
    );
    await assert.rejects(
      service.update(manager.id, { ...base, email: manager.email, permissions: ['users.view'] }, manager),
      /tuoi permessi/,
    );
    const dto = await service.update(
      manager.id,
      { ...base, email: manager.email, permissions: ['users.manage', 'chat.use'], phone: '333 1234567' },
      manager,
    );
    assert.equal(dto.phone, '333 1234567');
  });

  it('non si può disattivare sé stessi; deve restare almeno un amministratore attivo', async () => {
    await assert.rejects(service.disable(admin.id, admin), status(409));
    const other = add({ id: 2, idp_user_id: 'z-2', email: 'b@example.com', is_admin: true });
    users.set(1, { ...admin, is_admin: false });
    await assert.rejects(service.disable(other.id, admin), /almeno un amministratore/);
  });

  it('disattiva: chiude le sessioni e annulla il link d’accesso', async () => {
    add({ id: 2, idp_user_id: 'z-2', email: 'b@example.com' });
    const dto = await service.disable(2, admin);
    assert.equal(dto.status, 'disabled');
    assert.deepEqual(calls, ['deleteSessions:2']);
    assert.equal(users.get(2)!.access_link_hash, null);
  });

  it('elimina: non sé stessi, resta un amministratore attivo, il resto se ne va', async () => {
    await assert.rejects(service.remove(admin.id, admin), /te stesso/);
    const other = add({ id: 2, idp_user_id: 'z-2', email: 'b@example.com', is_admin: true });
    users.set(1, { ...admin, is_admin: false });
    await assert.rejects(service.remove(other.id, admin), /almeno un amministratore/);
    users.set(1, admin);
    await service.remove(other.id, admin);
    assert.deepEqual(calls, ['delete:2']);
    assert.equal(users.has(2), false);
    await assert.rejects(service.remove(2, admin), /non trovato/);
  });

  it('modifica: allinea ZITADEL solo se cambiano nome o email', async () => {
    add({ id: 2, idp_user_id: 'z-2', email: 'b@example.com' });
    await service.update(2, { ...base, email: 'b@example.com', phone: '333 1234567' }, admin);
    assert.deepEqual(calls, ['permissions:2:']);
    await service.update(2, { ...base, email: 'b@example.com', firstName: 'Luca' }, admin);
    assert.deepEqual(calls, ['permissions:2:', 'sync:z-2:Luca', 'permissions:2:']);
  });

  describe('chi gestisce gli utenti senza essere amministratore', () => {
    it('assegna solo i permessi che ha', async () => {
      await service.create({ ...input, permissions: ['users.manage'] }, manager);
      const viewer = record({ id: 8, is_admin: false, permissions: ['users.view'] });
      await assert.rejects(
        service.create({ ...input, email: 'x@example.com', permissions: ['users.manage'] }, viewer),
        status(403),
      );
      const noChat = record({ id: 10, is_admin: false, permissions: ['users.manage'] });
      await assert.rejects(
        service.create({ ...input, email: 'y@example.com', permissions: ['chat.use'] }, noChat),
        status(403),
      );
    });

    it('non nomina amministratori e non tocca gli amministratori', async () => {
      await assert.rejects(service.create({ ...input, isAdmin: true }, manager), /amministratore/);
      await assert.rejects(
        service.update(admin.id, { ...base, email: admin.email, isAdmin: true }, manager),
        status(403),
      );
      await assert.rejects(service.invite(admin.id, manager), status(403));
      await assert.rejects(service.disable(admin.id, manager), status(403));
      await assert.rejects(service.remove(admin.id, manager), status(403));
    });

    it('non gestisce chi ha permessi che lui non ha (presa del suo account via email e invito)', async () => {
      const limited = record({ id: 8, is_admin: false, permissions: ['users.view'] });
      const strong = add({ id: 3, email: 'c@example.com', permissions: ['users.manage'] });
      await assert.rejects(service.invite(strong.id, limited), status(403));
      await assert.rejects(
        service.update(strong.id, { ...base, email: 'mia@example.com', permissions: ['users.manage'] }, limited),
        status(403),
      );
      const weak = add({ id: 4, email: 'd@example.com', permissions: ['users.view'] });
      assert.ok(await service.invite(weak.id, manager));
    });
  });
});
