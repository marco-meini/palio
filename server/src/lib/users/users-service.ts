import type { ModelUsers } from '../../model/users.model.js';
import type { AuthUser } from '../auth/auth-types.js';
import type { CreateUserResponseDto, InviteDto, UserDto, UserInputDto } from '../auth/dto.js';
import { effectivePermissions } from '../auth/permissions.js';
import { conflict, forbidden, notFound } from '../http-error.js';
import { toHttpError, type ZitadelGrant, type ZitadelService } from '../zitadel.js';
import { toUserDto } from './users-mapper.js';
import { fullName } from './users-validation.js';

/**
 * Utenti di Dimmelo: chi ha accesso al progetto Dimmelo su ZITADEL (user grant) e con quali
 * ruoli. ZITADEL è la fonte di verità; palio aggiunge solo l'ultimo accesso. Gli utenti stanno
 * nell'organizzazione di Dimmelo su ZITADEL (ogni app ha la sua): togliere l'accesso a Dimmelo
 * non cancella l'account.
 *
 * Regole: si gestiscono solo utenti con permessi che si hanno anche (cambiandogli l'email e
 * mandando un invito se ne prenderebbe il posto), si assegnano solo permessi propri, nessuno
 * cambia i propri permessi e deve restare almeno un utente attivo che gestisce gli utenti.
 */
export class UsersService {
  constructor(
    private readonly zitadel: ZitadelService,
    private readonly repository: ModelUsers,
    private readonly appUrl: string,
  ) {}

  async list(): Promise<UserDto[]> {
    const grants = await this.call(() => this.zitadel.listGrants());
    const logins = await this.repository.lastLogins(grants.map((g) => g.userId));
    return grants
      .map((g) => toUserDto(g, logins.get(g.userId)))
      .sort(
        (a, b) =>
          Number(a.status === 'disabled') - Number(b.status === 'disabled') ||
          a.lastName.localeCompare(b.lastName, 'it', { sensitivity: 'base' }) ||
          a.firstName.localeCompare(b.firstName, 'it', { sensitivity: 'base' }),
      );
  }

  async get(id: string): Promise<UserDto> {
    return this.dto(await this.find(id));
  }

  /**
   * Dà accesso a Dimmelo: collega l'account ZITADEL con quella email (es. già usato in
   * un'altra app) o lo crea, assegna i ruoli e prepara l'invito (passkey o, se sa già entrare,
   * il link di Dimmelo).
   */
  async create(input: UserInputDto, actor: AuthUser): Promise<CreateUserResponseDto> {
    this.checkAssignment(actor, input.permissions);
    return this.call(async () => {
      const existing = await this.zitadel.findUserByEmail(input.email);
      if (existing && (await this.zitadel.listGrants(existing.userId)).length > 0) {
        throw conflict('Questa persona ha già accesso a Dimmelo');
      }
      const userId =
        existing?.userId ??
        (await this.zitadel.createUser({
          ...input,
          displayName: fullName(input.firstName, input.lastName),
        }));
      await this.zitadel.addGrant(userId, input.permissions);
      console.info(`[users] Accesso a Dimmelo per ${userId} (${existing ? 'account esistente' : 'nuovo account'})`);
      const user = await this.find(userId);
      return { user: await this.dto(user), invite: await this.inviteFor(userId) };
    });
  }

  async update(id: string, input: UserInputDto, actor: AuthUser): Promise<UserDto> {
    const grant = await this.find(id);
    const self = id === actor.idp_user_id;
    if (self) {
      if (!sameSet(input.permissions, grant.roleKeys)) {
        throw conflict('Non puoi cambiare i tuoi permessi');
      }
    } else {
      this.checkCanManage(actor, grant);
      this.checkAssignment(actor, input.permissions);
      if (!effectivePermissions(input.permissions).includes('users.manage')) {
        await this.ensureOtherManager(grant);
      }
    }
    return this.call(async () => {
      if (input.email !== grant.email.toLowerCase()) {
        const sameEmail = await this.zitadel.findUserByEmail(input.email);
        if (sameEmail && sameEmail.userId !== id) {
          throw conflict('Esiste già un account con questa email');
        }
      }
      const displayName = fullName(input.firstName, input.lastName);
      if (
        input.firstName !== grant.firstName ||
        input.lastName !== grant.lastName ||
        input.email !== grant.email.toLowerCase()
      ) {
        await this.zitadel.updateUser(id, { ...input, displayName });
      }
      if (!sameSet(input.permissions, grant.roleKeys)) {
        // le sessioni aperte prendono i nuovi permessi al prossimo refresh (entro 5 minuti)
        await this.zitadel.updateGrant(id, grant.grantId, input.permissions);
      }
      return this.dto(await this.find(id));
    });
  }

  /** Nuovo invito (es. il link precedente è scaduto). */
  async invite(id: string, actor: AuthUser): Promise<InviteDto> {
    const grant = await this.find(id);
    this.checkCanManage(actor, grant);
    if (!grant.active) throw conflict("L'accesso dell'utente è disattivato");
    return this.call(() => this.inviteFor(id));
  }

  /** Sospende l'accesso a Dimmelo (i ruoli restano) e chiude le sessioni aperte. */
  async disable(id: string, actor: AuthUser): Promise<UserDto> {
    if (id === actor.idp_user_id) throw conflict('Non puoi disattivare te stesso');
    const grant = await this.find(id);
    this.checkCanManage(actor, grant);
    if (!grant.active) return this.dto(grant);
    await this.ensureOtherManager(grant);
    await this.call(() => this.zitadel.deactivateGrant(id, grant.grantId));
    await this.repository.deleteSessions(id);
    return this.dto({ ...grant, active: false });
  }

  async enable(id: string, actor: AuthUser): Promise<UserDto> {
    const grant = await this.find(id);
    this.checkCanManage(actor, grant);
    if (grant.active) return this.dto(grant);
    await this.call(() => this.zitadel.reactivateGrant(id, grant.grantId));
    return this.dto({ ...grant, active: true });
  }

  /** Toglie l'accesso a Dimmelo. L'account su ZITADEL e le passkey restano. */
  async remove(id: string, actor: AuthUser): Promise<void> {
    if (id === actor.idp_user_id) throw conflict('Non puoi eliminare te stesso');
    const grant = await this.find(id);
    this.checkCanManage(actor, grant);
    if (grant.active) await this.ensureOtherManager(grant);
    await this.call(() => this.zitadel.removeGrant(id, grant.grantId));
    await this.repository.deleteSessions(id);
  }

  /** Si gestiscono solo utenti con permessi che si hanno anche. */
  private checkCanManage(actor: AuthUser, grant: ZitadelGrant): void {
    const own = effectivePermissions(actor.permissions);
    if (!effectivePermissions(grant.roleKeys).every((p) => own.includes(p))) {
      throw forbidden('Non puoi gestire un utente che ha permessi che tu non hai');
    }
  }

  /** Si assegnano solo permessi che si hanno anche. */
  private checkAssignment(actor: AuthUser, permissions: readonly string[]): void {
    const own = effectivePermissions(actor.permissions);
    if (!effectivePermissions(permissions).every((p) => own.includes(p))) {
      throw forbidden('Puoi assegnare solo i permessi che hai anche tu');
    }
  }

  /** Deve restare almeno un altro utente attivo che gestisce gli utenti. */
  private async ensureOtherManager(grant: ZitadelGrant): Promise<void> {
    if (!grant.active || !effectivePermissions(grant.roleKeys).includes('users.manage')) return;
    const grants = await this.call(() => this.zitadel.listGrants());
    const others = grants.filter(
      (g) => g.userId !== grant.userId && g.active && effectivePermissions(g.roleKeys).includes('users.manage'),
    );
    if (others.length === 0) {
      throw conflict('Deve restare almeno un utente attivo che gestisce gli utenti');
    }
  }

  private async find(id: string): Promise<ZitadelGrant> {
    const [grant] = await this.call(() => this.zitadel.listGrants(id));
    if (!grant) throw notFound('Utente non trovato');
    return grant;
  }

  private async dto(grant: ZitadelGrant): Promise<UserDto> {
    const logins = await this.repository.lastLogins([grant.userId]);
    return toUserDto(grant, logins.get(grant.userId));
  }

  private async inviteFor(userId: string): Promise<InviteDto> {
    if (await this.zitadel.hasLoginMethod(userId)) return { kind: 'login', url: this.appUrl };
    return { kind: 'passkey', url: await this.zitadel.passkeyRegistrationLink(userId, this.appUrl) };
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
}
