import * as oidc from 'openid-client';
import type { ModelAuth } from '../../model/auth.model.js';
import { forbidden } from '../http-error.js';
import type { AuthUser } from './auth-types.js';
import { LOGIN_STATE_TTL_MS, type LoginState, safeReturnTo } from './login-state.js';
import type { OidcClient } from './oidc-client.js';
import type { CreatedSession, SessionService } from './session-service.js';

export const NO_ACCESS =
  'Il tuo account non ha accesso a Dimmelo. Chiedi a chi gestisce gli utenti di invitarti.';

export interface SignedIn {
  user: AuthUser;
  session: CreatedSession;
  returnTo: string;
}

/**
 * Accesso con OIDC: la pagina di login (passkey, Google…) è di ZITADEL; palio riceve i token,
 * legge identità e ruoli del progetto Dimmelo e apre la propria sessione.
 */
export class AuthService {
  constructor(
    private readonly oidc: Pick<OidcClient, 'authorizationUrl' | 'exchange' | 'endSessionUrl'>,
    private readonly sessions: SessionService,
    private readonly model: ModelAuth,
  ) {}

  /**
   * Nuovo tentativo di login: URL di ZITADEL e stato da tenere nel cookie firmato. Con
   * `selectAccount` si sceglie l'account (es. quello usato non ha accesso a Dimmelo).
   */
  async startLogin(
    returnTo: unknown,
    selectAccount = false,
    now = Date.now(),
  ): Promise<{ url: string; state: LoginState }> {
    const state: LoginState = {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      codeVerifier: oidc.randomPKCECodeVerifier(),
      returnTo: safeReturnTo(returnTo),
      expiresAt: now + LOGIN_STATE_TTL_MS,
    };
    return { url: await this.oidc.authorizationUrl({ ...state, selectAccount }), state };
  }

  /**
   * Ritorno da ZITADEL: verifica i token, aggiorna il profilo e apre la sessione. Chi non ha
   * ruoli sul progetto Dimmelo non entra: lo decide palio (non ZITADEL), così torna alla pagina
   * di accesso e può scegliere un altro account.
   */
  async finishLogin(query: string, state: LoginState, userAgent: string | null): Promise<SignedIn> {
    const identity = await this.oidc.exchange(query, state);
    if (identity.permissions.length === 0) throw forbidden(NO_ACCESS);
    const user = await this.model.upsertUser({
      idp_user_id: identity.idpUserId,
      display_name: identity.displayName,
      email: identity.email,
    });
    return {
      user: { ...user, permissions: identity.permissions },
      session: await this.sessions.create(user.id, userAgent, identity),
      returnTo: state.returnTo,
    };
  }

  /** Chiude la sessione di palio; ritorna l'URL per uscire anche da ZITADEL. */
  async logout(sessionToken: string | undefined): Promise<string> {
    const idToken = sessionToken ? await this.sessions.destroy(sessionToken) : null;
    return this.oidc.endSessionUrl(idToken);
  }
}
