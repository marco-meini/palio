import * as oidc from 'openid-client';
import { badGateway } from '../http-error.js';
import { isPermission } from './permissions.js';
/** Il refresh token non vale più (revocato, utente disattivato, ruoli tolti…): sessione chiusa. */
export class RefreshRejectedError extends Error {
}
/** Login annullato o rifiutato da ZITADEL (es. utente senza ruoli sul progetto). */
export class LoginRejectedError extends Error {
}
/**
 * Client OIDC verso ZITADEL (authorization code + PKCE, client confidenziale): il server
 * fa da backend-for-frontend, il browser non vede mai i token.
 */
export class OidcClient {
    config;
    configuration;
    constructor(config) {
        this.config = config;
    }
    get redirectUri() {
        return `${this.config.appUrl}/api/auth/callback`;
    }
    get postLogoutRedirectUri() {
        return `${this.config.appUrl}/uscito`;
    }
    /**
     * URL della pagina di login di ZITADEL per questo tentativo. Con `selectAccount` ZITADEL mostra
     * l'elenco degli account invece di riusare la sessione già aperta nel browser.
     */
    async authorizationUrl(params) {
        const configuration = await this.discover();
        return oidc
            .buildAuthorizationUrl(configuration, {
            redirect_uri: this.redirectUri,
            scope: [
                'openid',
                'profile',
                'email',
                'offline_access',
                `urn:zitadel:iam:org:project:id:${this.config.zitadel.projectId}:aud`,
                'urn:zitadel:iam:org:projects:roles',
                // login solo nell'organizzazione di Dimmelo: un account con la stessa email in
                // un'altra organizzazione (altra app) non entra
                `urn:zitadel:iam:org:id:${this.config.zitadel.organizationId}`,
            ].join(' '),
            code_challenge: await oidc.calculatePKCECodeChallenge(params.codeVerifier),
            code_challenge_method: 'S256',
            // sempre la scelta dell'account: una sessione ZITADEL rimasta nel browser (es. di un
            // utente senza accesso a Dimmelo) non deve entrare da sola né bloccare gli altri
            prompt: 'select_account',
            state: params.state,
            nonce: params.nonce,
            ...(params.selectAccount ? { prompt: 'select_account' } : {}),
        })
            .toString();
    }
    /**
     * Pagina del Login V2 che registra la passkey dell'invito *dentro* un login OIDC: dopo la
     * passkey l'utente entra con quella e ZITADEL torna al callback di Dimmelo. Senza un login in
     * corso il Login V2 si fermerebbe su "Sei connesso". La richiesta di login la crea il server:
     * ZITADEL risponde con un redirect che ne contiene l'id (`…/login?authRequest=V2_…`), che il
     * Login V2 chiama `oidc_<id>`. Non serve il browser: il Login V2 la lega alla sessione che
     * crea quando l'utente entra con la passkey.
     */
    async invitePasskeyUrl(authorizationUrl, invite) {
        let location;
        try {
            const response = await fetch(authorizationUrl, {
                redirect: 'manual',
                signal: AbortSignal.timeout(10_000),
            });
            location = response.headers.get('location');
        }
        catch (error) {
            throw this.wrap(error, "richiesta di login per l'invito");
        }
        const authRequest = location
            ? new URL(location, this.config.zitadel.url).searchParams.get('authRequest')
            : null;
        if (!authRequest) {
            throw this.wrap(new Error(`redirect inatteso: ${location ?? 'nessuno'}`), "richiesta di login per l'invito");
        }
        const params = new URLSearchParams({ ...invite, requestId: `oidc_${authRequest}` });
        return `${this.config.zitadel.url}/ui/v2/login/passkey/set?${params.toString()}`;
    }
    /** Scambia il codice del callback (query string ricevuta) con i token e li verifica. */
    async exchange(query, expected) {
        const configuration = await this.discover();
        let tokens;
        try {
            tokens = await oidc.authorizationCodeGrant(configuration, new URL(`${this.redirectUri}?${query}`), {
                pkceCodeVerifier: expected.codeVerifier,
                expectedState: expected.state,
                expectedNonce: expected.nonce,
                idTokenExpected: true,
            });
        }
        catch (error) {
            if (error instanceof oidc.AuthorizationResponseError) {
                throw new LoginRejectedError(error.error_description ?? error.error);
            }
            throw this.wrap(error, 'scambio del codice');
        }
        return this.identity(tokens.claims(), tokens);
    }
    /**
     * Nuovi token con il refresh token: permessi e profilo aggiornati. ZITADEL rifiuta se
     * l'utente è disattivato o non ha più ruoli sul progetto → `RefreshRejectedError`.
     */
    async refresh(refreshToken, expectedSubject) {
        const configuration = await this.discover();
        let tokens;
        try {
            tokens = await oidc.refreshTokenGrant(configuration, refreshToken);
        }
        catch (error) {
            if (error instanceof oidc.ResponseBodyError && error.status >= 400 && error.status < 500) {
                throw new RefreshRejectedError(error.error);
            }
            throw this.wrap(error, 'refresh');
        }
        const claims = tokens.claims() ??
            (await oidc.fetchUserInfo(configuration, tokens.access_token, expectedSubject));
        if (claims['sub'] !== expectedSubject)
            throw new RefreshRejectedError('utente diverso');
        return this.identity(claims, { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken });
    }
    /** Logout anche su ZITADEL (chiude il single sign-on), poi ritorno a `/uscito`. */
    async endSessionUrl(idToken) {
        try {
            const configuration = await this.discover();
            return oidc
                .buildEndSessionUrl(configuration, {
                post_logout_redirect_uri: this.postLogoutRedirectUri,
                ...(idToken ? { id_token_hint: idToken } : { client_id: this.config.oidc.clientId }),
            })
                .toString();
        }
        catch {
            // ZITADEL irraggiungibile: si esce almeno da Dimmelo
            return this.postLogoutRedirectUri;
        }
    }
    identity(claims, tokens) {
        const sub = claims['sub'];
        if (typeof sub !== 'string' || !sub)
            throw new LoginRejectedError('Token senza utente');
        const email = typeof claims['email'] === 'string' ? claims['email'].toLowerCase() : null;
        const name = [claims['name'], claims['preferred_username'], email].find((v) => typeof v === 'string' && v.trim() !== '') ?? sub;
        return {
            idpUserId: sub,
            displayName: name.trim(),
            email,
            permissions: rolesFromClaims(claims, this.config.zitadel.projectId),
            refreshToken: tokens.refresh_token ?? null,
            idToken: tokens.id_token ?? null,
        };
    }
    /** Discovery dell'issuer, una volta (riprovata se fallisce). */
    discover() {
        this.configuration ??= oidc
            .discovery(new URL(this.config.zitadel.url), this.config.oidc.clientId, undefined, oidc.ClientSecretBasic(this.config.oidc.clientSecret), new URL(this.config.zitadel.url).protocol === 'http:'
            ? { execute: [oidc.allowInsecureRequests] }
            : undefined)
            .catch((error) => {
            this.configuration = undefined;
            throw this.wrap(error, 'discovery');
        });
        return this.configuration;
    }
    wrap(error, step) {
        const detail = error instanceof oidc.ResponseBodyError
            ? `${error.status} ${error.error}`
            : error.message;
        console.error(`[oidc] ${step}: ${detail}`);
        return badGateway('Servizio di identità non raggiungibile o risposta non valida');
    }
}
/**
 * Ruoli del progetto nei claim di ZITADEL: `urn:zitadel:iam:org:project:<id>:roles` (o il
 * claim generico), oggetti `{ "<ruolo>": { "<orgId>": "<dominio>" } }`. Si tengono solo i
 * ruoli che sono permessi dell'app.
 */
export function rolesFromClaims(claims, projectId) {
    const roles = claims[`urn:zitadel:iam:org:project:${projectId}:roles`] ??
        claims['urn:zitadel:iam:org:project:roles'];
    if (!roles || typeof roles !== 'object')
        return [];
    return Object.keys(roles).filter(isPermission).sort();
}
//# sourceMappingURL=oidc-client.js.map