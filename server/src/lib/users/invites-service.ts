import { createHash, randomBytes } from 'node:crypto';
import type { AuthConfig } from '../../auth-config.js';
import type { ModelUsers } from '../../model/users.model.js';
import type { AuthService, SignedIn } from '../auth/auth-service.js';
import type { IAppUserRecord } from '../auth/auth-types.js';
import type {
  InviteDto,
  InviteStatusDto,
  PasskeyCredentialDto,
  PasskeyRegistrationStartResponseDto,
} from '../auth/dto.js';
import { passkeyName } from '../auth/passkey-credential.js';
import { badRequest, gone, notFound } from '../http-error.js';
import { toHttpError, ZitadelError, type ZitadelService } from '../zitadel.js';
import type { AccountsService } from './accounts-service.js';

export const hashAccessLink = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Link d'accesso monouso (invito e recupero): portano alla pagina `/invito/<token>` di palio,
 * dove l'utente crea la passkey ed entra subito. Ogni utente ha al più un link valido: uno
 * nuovo sostituisce il precedente. In DB c'è solo l'hash del token.
 */
export class InvitesService {
  constructor(
    private readonly config: Pick<AuthConfig, 'appUrl' | 'accessLinks'>,
    private readonly repository: ModelUsers,
    private readonly accounts: AccountsService,
    private readonly zitadel: ZitadelService,
    private readonly auth: AuthService,
  ) {}

  /** Genera un nuovo link (durata predefinita: quella degli inviti). */
  async issue(
    user: IAppUserRecord,
    ttlMinutes = this.config.accessLinks.inviteTtlHours * 60,
  ): Promise<InviteDto> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    await this.repository.update(user.id, {
      access_link_hash: hashAccessLink(token),
      access_link_expires_at: expiresAt,
    });
    return { url: `${this.config.appUrl}/invito/${token}`, expiresAt: expiresAt.toISOString() };
  }

  async status(token: string, now = Date.now()): Promise<InviteStatusDto> {
    const user = await this.find(token, now);
    return {
      firstName: user.first_name,
      email: user.email,
      expiresAt: user.access_link_expires_at!.toISOString(),
    };
  }

  /** Inizio della creazione della passkey: collega l'account ZITADEL se serve. */
  async startPasskey(token: string): Promise<PasskeyRegistrationStartResponseDto> {
    const user = await this.find(token);
    const idpUserId = await this.accounts.ensure(user);
    try {
      return await this.zitadel.startPasskeyRegistration(idpUserId);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /** Passkey creata dal browser: ZITADEL la verifica, il link si consuma e l'utente entra. */
  async finishPasskey(
    token: string,
    passkeyId: string,
    credential: PasskeyCredentialDto,
    userAgent: string | null,
  ): Promise<SignedIn> {
    const user = await this.find(token);
    if (!user.idp_user_id) throw badRequest('Passkey non avviata: riprova.');
    try {
      await this.zitadel.finishPasskeyRegistration(
        user.idp_user_id,
        passkeyId,
        credential,
        passkeyName(userAgent),
      );
    } catch (error) {
      if (error instanceof ZitadelError && error.status < 500) {
        throw badRequest('La passkey non è stata accettata. Riprova.');
      }
      throw toHttpError(error);
    }
    await this.repository.update(user.id, { access_link_hash: null, access_link_expires_at: null });
    return this.auth.signIn(user, userAgent);
  }

  /** Utente del link: 404 se non valido (o già usato), 410 se scaduto. */
  private async find(token: string, now = Date.now()): Promise<IAppUserRecord> {
    const user =
      token.length <= 100 ? await this.repository.findByAccessLinkHash(hashAccessLink(token)) : null;
    if (!user || user.disabled_at || !user.access_link_expires_at) {
      throw notFound('Link non valido o già usato');
    }
    if (user.access_link_expires_at.getTime() < now) {
      throw gone('Link scaduto: chiedine uno nuovo');
    }
    return user;
  }
}
