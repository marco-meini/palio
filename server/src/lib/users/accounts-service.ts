import type { ModelUsers } from '../../model/users.model.js';
import type { IAppUserRecord } from '../auth/auth-types.js';
import { conflict } from '../http-error.js';
import { toHttpError, type ZitadelService } from '../zitadel.js';

/**
 * Collega gli utenti di palio alla loro identità su ZITADEL. L'identità è condivisa tra le
 * app: se esiste già un account con la stessa email lo si collega, altrimenti lo si crea.
 * Avviene la prima volta che l'utente apre un link d'accesso (invito o recupero).
 */
export class AccountsService {
  constructor(
    private readonly repository: ModelUsers,
    private readonly zitadel: ZitadelService,
  ) {}

  /** Id dell'utente su ZITADEL, collegando o creando l'account se serve. */
  async ensure(user: IAppUserRecord): Promise<string> {
    if (user.idp_user_id) return user.idp_user_id;
    return this.call(async () => {
      const existing = await this.zitadel.findUserByEmail(user.email);
      if (existing && (await this.repository.findByIdpUserId(existing.userId))) {
        throw conflict("L'account di questa email è già collegato a un altro utente");
      }
      const id = existing?.userId ?? (await this.zitadel.createUser(identity(user)));
      try {
        await this.repository.update(user.id, { idp_user_id: id });
      } catch (error) {
        if (!existing) await this.rollback(id);
        throw error;
      }
      console.info(
        `[accounts] Utente ${user.id} ${existing ? 'collegato all' : 'con nuovo'} account ZITADEL ${id}`,
      );
      return id;
    });
  }

  /** Allinea nome ed email dell'account ZITADEL (se l'utente è già collegato). */
  async sync(user: IAppUserRecord): Promise<void> {
    if (!user.idp_user_id) return;
    const id = user.idp_user_id;
    await this.call(() => this.zitadel.updateUser(id, identity(user)));
  }

  private async rollback(id: string): Promise<void> {
    try {
      await this.zitadel.deleteUser(id);
    } catch (error) {
      console.error(
        `[accounts] Account ZITADEL ${id} creato ma non eliminato: ${(error as Error).message}`,
      );
    }
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function identity(user: IAppUserRecord) {
  return {
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    displayName: user.display_name,
  };
}
