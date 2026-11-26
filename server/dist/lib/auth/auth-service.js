import * as oidc from 'openid-client';
import { forbidden } from '../http-error.js';
import { LOGIN_STATE_TTL_MS, safeReturnTo } from './login-state.js';
export const NO_ACCESS = 'Il tuo account non ha accesso a Dimmelo. Chiedi a chi gestisce gli utenti di invitarti.';
/**
 * Accesso con OIDC: la pagina di login (passkey, Google…) è di ZITADEL; palio riceve i token,
 * legge identità e ruoli del progetto Dimmelo e apre la propria sessione.
 */
export class AuthService {
    oidc;
    sessions;
    model;
    constructor(oidc, sessions, model) {
        this.oidc = oidc;
        this.sessions = sessions;
        this.model = model;
    }
    /**
     * Nuovo tentativo di login: URL di ZITADEL e stato da tenere nel cookie firmato. Con
     * `selectAccount` si sceglie l'account (es. quello usato non ha accesso a Dimmelo).
     */
    async startLogin(returnTo, selectAccount = false, now = Date.now()) {
        const state = {
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
    async finishLogin(query, state, userAgent) {
        const identity = await this.oidc.exchange(query, state);
        if (identity.permissions.length === 0)
            throw forbidden(NO_ACCESS);
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
    async logout(sessionToken) {
        const idToken = sessionToken ? await this.sessions.destroy(sessionToken) : null;
        return this.oidc.endSessionUrl(idToken);
    }
}
//# sourceMappingURL=auth-service.js.map