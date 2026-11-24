import type { Db } from '../db.js';
import { type IUserWithPermissionsRow, ModelUsers } from '../../model/users.model.js';
import type { AuthUser } from '../auth/auth-types.js';
import type { CreateUserResponseDto, InviteDto, UserDto, UserInputDto } from '../auth/dto.js';
import { effectivePermissions } from '../auth/permissions.js';
import { conflict, forbidden, notFound } from '../http-error.js';
import type { AccountsService } from './accounts-service.js';
import type { InvitesService } from './invites-service.js';
import { toUserDto } from './users-mapper.js';
import { fullName } from './users-validation.js';

/**
 * Censimento utenti: palio è la fonte di verità (anagrafica, contatti, permessi, stato).
 * L'identità su ZITADEL si collega o si crea quando l'utente apre il link d'accesso
 * (vedi `AccountsService`); chi entra in palio e cosa può fare lo decide sempre palio.
 *
 * Regole per chi gestisce gli utenti senza essere amministratore: non tocca gli
 * amministratori né chi ha permessi che lui non ha (cambiandogli l'email e mandando un invito
 * ne prenderebbe il posto), e assegna solo permessi che ha anche lui. Nessuno cambia i
 * propri permessi; deve restare almeno un amministratore attivo.
 */
export class UsersService {
  private readonly repository: ModelUsers;

  /** `models` crea il model sulla connessione data (anche quella di una transazione). */
  constructor(
    private readonly db: Db,
    private readonly accounts: AccountsService,
    private readonly invites: InvitesService,
    private readonly models: (db: Db) => ModelUsers = (d) => new ModelUsers(d),
  ) {
    this.repository = models(db);
  }

  async list(): Promise<UserDto[]> {
    return (await this.repository.list()).map(toUserDto);
  }

  async get(id: number): Promise<UserDto> {
    return toUserDto(await this.find(id));
  }

  async create(input: UserInputDto, actor: AuthUser): Promise<CreateUserResponseDto> {
    this.checkAssignment(actor, input);
    if (await this.repository.findByEmail(input.email)) {
      throw conflict('Esiste già un utente con questa email');
    }
    const user = await this.db.transaction(async (tx) => {
      const users = this.models(tx);
      const row = await users.insert({
        first_name: input.firstName,
        last_name: input.lastName,
        display_name: fullName(input.firstName, input.lastName),
        email: input.email,
        phone: input.phone,
        is_admin: input.isAdmin,
        created_by: actor.id,
      });
      await users.setPermissions(row.id, input.permissions);
      return { ...row, permissions: input.permissions };
    });
    return { user: toUserDto(user), invite: await this.invites.issue(user) };
  }

  async update(id: number, input: UserInputDto, actor: AuthUser): Promise<UserDto> {
    const user = await this.find(id);
    if (user.id === actor.id) {
      if (input.isAdmin !== user.is_admin || !sameSet(input.permissions, user.permissions)) {
        throw conflict('Non puoi cambiare i tuoi permessi');
      }
    } else {
      this.checkCanManage(actor, user);
      this.checkAssignment(actor, input);
      if (user.is_admin && !input.isAdmin) await this.ensureOtherAdmin(user);
    }
    const sameEmail = await this.repository.findByEmail(input.email);
    if (sameEmail && sameEmail.id !== id) {
      throw conflict('Esiste già un utente con questa email');
    }

    const changes = {
      first_name: input.firstName,
      last_name: input.lastName,
      display_name: fullName(input.firstName, input.lastName),
      email: input.email,
      phone: input.phone,
      is_admin: input.isAdmin,
    };
    const changesIdentity =
      user.first_name !== input.firstName ||
      user.last_name !== input.lastName ||
      user.email !== input.email;
    // l'identità è condivisa con le altre app: nome ed email restano allineati su ZITADEL
    if (changesIdentity) await this.accounts.sync({ ...user, ...changes });
    const updated = await this.db.transaction(async (tx) => {
      const users = this.models(tx);
      const row = await users.update(id, changes);
      await users.setPermissions(id, input.permissions);
      return { ...row, permissions: input.permissions };
    });
    return toUserDto(updated);
  }

  /** Nuovo link d'invito (es. il precedente è scaduto o l'utente ha perso la passkey). */
  async invite(id: number, actor: AuthUser): Promise<InviteDto> {
    const user = await this.find(id);
    this.checkCanManage(actor, user);
    if (user.disabled_at) throw conflict("L'utente è disattivato");
    return this.invites.issue(user);
  }

  /**
   * Disattiva: niente più accesso a palio, sessioni chiuse e link d'accesso annullato.
   * L'account ZITADEL resta: può servire alle altre app.
   */
  async disable(id: number, actor: AuthUser): Promise<UserDto> {
    const user = await this.find(id);
    if (user.id === actor.id) throw conflict('Non puoi disattivare te stesso');
    this.checkCanManage(actor, user);
    if (user.disabled_at) return toUserDto(user);
    if (user.is_admin) await this.ensureOtherAdmin(user);

    const updated = await this.db.transaction(async (tx) => {
      const users = this.models(tx);
      await users.deleteSessions(id);
      return users.update(id, {
        disabled_at: new Date(),
        access_link_hash: null,
        access_link_expires_at: null,
      });
    });
    return toUserDto({ ...updated, permissions: user.permissions });
  }

  async enable(id: number, actor: AuthUser): Promise<UserDto> {
    const user = await this.find(id);
    this.checkCanManage(actor, user);
    if (!user.disabled_at) return toUserDto(user);
    const updated = await this.repository.update(id, { disabled_at: null });
    return toUserDto({ ...updated, permissions: user.permissions });
  }

  /**
   * Elimina l'utente da palio (con permessi e sessioni). L'identità su ZITADEL e le passkey
   * restano: sono condivise con le altre app.
   */
  async remove(id: number, actor: AuthUser): Promise<void> {
    const user = await this.find(id);
    if (user.id === actor.id) throw conflict('Non puoi eliminare te stesso');
    this.checkCanManage(actor, user);
    if (user.is_admin && !user.disabled_at) await this.ensureOtherAdmin(user);
    if (!(await this.repository.delete(id))) throw notFound('Utente non trovato');
  }

  /** Chi non è amministratore gestisce solo utenti con permessi che ha anche lui. */
  private checkCanManage(actor: AuthUser, user: IUserWithPermissionsRow): void {
    if (actor.is_admin) return;
    if (user.is_admin) throw forbidden('Solo un amministratore può gestire un amministratore');
    const own = effectivePermissions(false, actor.permissions);
    if (!effectivePermissions(false, user.permissions).every((p) => own.includes(p))) {
      throw forbidden('Non puoi gestire un utente che ha permessi che tu non hai');
    }
  }

  /** Chi non è amministratore assegna solo permessi che ha anche lui, e mai il ruolo di amministratore. */
  private checkAssignment(actor: AuthUser, input: UserInputDto): void {
    if (actor.is_admin) return;
    if (input.isAdmin) throw forbidden('Solo un amministratore può nominare un amministratore');
    const own = effectivePermissions(false, actor.permissions);
    if (!effectivePermissions(false, input.permissions).every((p) => own.includes(p))) {
      throw forbidden('Puoi assegnare solo i permessi che hai anche tu');
    }
  }

  private async find(id: number): Promise<IUserWithPermissionsRow> {
    const user = await this.repository.findWithPermissions(id);
    if (!user) throw notFound('Utente non trovato');
    return user;
  }

  private async ensureOtherAdmin(user: IUserWithPermissionsRow): Promise<void> {
    if ((await this.repository.countOtherActiveAdmins(user.id)) === 0) {
      throw conflict('Deve restare almeno un amministratore attivo');
    }
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === new Set(b).size && a.every((x) => b.includes(x));
}
