import type { ModelAuth } from '../../model/auth.model.js';
import { badRequest, forbidden, tooManyRequests, unauthorized } from '../http-error.js';
import { toHttpError, ZitadelError, type ZitadelService } from '../zitadel.js';
import type { AuthUser, IAppUserRecord } from './auth-types.js';
import type { PasskeyCredentialDto, WebAuthnOptionsJson } from './dto.js';
import { LOGIN_STATE_TTL_MS, type LoginState } from './login-state.js';
import { RateLimiter } from './rate-limiter.js';
import type { CreatedSession, SessionService } from './session-service.js';

export const NO_PASSKEY =
  'Per questa email non c’è una passkey utilizzabile. Usa «Non riesci ad accedere?» per crearne una.';
export const DISABLED = 'Il tuo accesso a Dimmelo è stato disattivato. Chiedi a un amministratore.';
export const NOT_RECOGNIZED = 'La passkey non è stata riconosciuta. Riprova.';

export interface SignedIn {
  user: AuthUser;
  session: CreatedSession;
}

/**
 * Accesso con passkey nella pagina di palio. ZITADEL genera la challenge e verifica la firma;
 * palio decide chi entra (utenti censiti e attivi) e tiene la propria sessione.
 */
export class AuthService {
  private readonly perIp = new RateLimiter(30, 15 * 60_000);

  constructor(
    private readonly zitadel: ZitadelService,
    private readonly sessions: SessionService,
    private readonly model: ModelAuth,
  ) {}

  /** Prepara la challenge per l'utente con quella email. */
  async startLogin(
    email: string,
    ip: string,
    now = Date.now(),
  ): Promise<{ options: WebAuthnOptionsJson; state: LoginState }> {
    if (!this.perIp.hit(ip, now)) {
      throw tooManyRequests('Troppi tentativi. Riprova tra qualche minuto.');
    }
    const user = await this.model.findUserByEmail(email);
    if (user?.disabled_at) throw forbidden(DISABLED);
    if (!user?.idp_user_id) throw badRequest(NO_PASSKEY);
    try {
      const { sessionId, options } = await this.zitadel.startLogin(user.idp_user_id);
      return {
        options,
        state: { sessionId, userId: user.id, expiresAt: now + LOGIN_STATE_TTL_MS },
      };
    } catch (error) {
      // es. nessuna passkey sul dominio di palio, account disattivato su ZITADEL
      if (error instanceof ZitadelError && error.status < 500) throw badRequest(NO_PASSKEY);
      throw toHttpError(error);
    }
  }

  /** Verifica la passkey firmata dal browser ed entra. */
  async finishLogin(
    state: LoginState,
    credential: PasskeyCredentialDto,
    userAgent: string | null,
  ): Promise<SignedIn> {
    let idpUserId: string;
    try {
      idpUserId = await this.zitadel.finishLogin(state.sessionId, credential);
    } catch (error) {
      if (error instanceof ZitadelError && error.status < 500) throw unauthorized(NOT_RECOGNIZED);
      throw toHttpError(error);
    }
    const user = await this.model.findUserById(state.userId);
    if (!user || user.idp_user_id !== idpUserId) throw unauthorized(NOT_RECOGNIZED);
    return this.signIn(user, userAgent);
  }

  /** Apre la sessione di palio per un utente che ha appena provato la sua identità. */
  async signIn(user: IAppUserRecord, userAgent: string | null): Promise<SignedIn> {
    if (user.disabled_at) throw forbidden(DISABLED);
    await this.model.touchLogin(user.id);
    const permissions = await this.model.findPermissions(user.id);
    return {
      user: { ...user, permissions },
      session: await this.sessions.create(user.id, userAgent),
    };
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (sessionToken) await this.sessions.destroy(sessionToken);
  }
}
