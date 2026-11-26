import * as oidc from 'openid-client';
import type { AuthConfig } from '../../auth-config.js';
import { badGateway } from '../http-error.js';
import { isPermission, type Permission } from './permissions.js';

/** Identità e permessi letti dai token di ZITADEL. */
export interface OidcIdentity {
  /** Id dell'utente su ZITADEL (claim `sub`). */
  idpUserId: string;
  displayName: string;
  email: string | null;
  /** Ruoli del progetto Dimmelo che corrispondono a permessi dell'app. */
  permissions: Permission[];
  refreshToken: string | null;
  idToken: string | null;
}

/** Codice d'invito di ZITADEL per registrare la passkey di un utente (Login V2). */
export interface PasskeyInvite {
  userId: string;
  organization: string;
  codeId: string;
  code: string;
}

/** Il refresh token non vale più (revocato, utente disattivato, ruoli tolti…): sessione chiusa. */
export class RefreshRejectedError extends Error {}

/** Login annullato o rifiutato da ZITADEL (es. utente senza ruoli sul progetto). */
export class LoginRejectedError extends Error {}

type Claims = Record<string, unknown>;

/**
 * Client OIDC verso ZITADEL (authorization code + PKCE, client confidenziale): il server
 * fa da backend-for-frontend, il browser non vede mai i token.
 */
export class OidcClient {
  private configuration?: Promise<oidc.Configuration>;

  constructor(private readonly config: Pick<AuthConfig, 'appUrl' | 'zitadel' | 'oidc'>) {}

  get redirectUri(): string {
    return `${this.config.appUrl}/api/auth/callback`;
  }

  get postLogoutRedirectUri(): string {
    return `${this.config.appUrl}/uscito`;
  }

  /**
   * URL della pagina di login di ZITADEL per questo tentativo. Con `selectAccount` ZITADEL mostra
   * l'elenco degli account invece di riusare la sessione già aperta nel browser.
   */
  async authorizationUrl(params: {
    state: string;
    nonce: string;
    codeVerifier: string;
    selectAccount?: boolean;
  }): Promise<string> {
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
  async invitePasskeyUrl(authorizationUrl: string, invite: PasskeyInvite): Promise<string> {
    let location: string | null;
    try {
      const response = await fetch(authorizationUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      location = response.headers.get('location');
    } catch (error) {
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
  async exchange(
    query: string,
    expected: { state: string; nonce: string; codeVerifier: string },
  ): Promise<OidcIdentity> {
    const configuration = await this.discover();
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(
        configuration,
        new URL(`${this.redirectUri}?${query}`),
        {
          pkceCodeVerifier: expected.codeVerifier,
          expectedState: expected.state,
          expectedNonce: expected.nonce,
          idTokenExpected: true,
        },
      );
    } catch (error) {
      if (error instanceof oidc.AuthorizationResponseError) {
        throw new LoginRejectedError(error.error_description ?? error.error);
      }
      throw this.wrap(error, 'scambio del codice');
    }
    return this.identity(tokens.claims() as Claims, tokens);
  }

  /**
   * Nuovi token con il refresh token: permessi e profilo aggiornati. ZITADEL rifiuta se
   * l'utente è disattivato o non ha più ruoli sul progetto → `RefreshRejectedError`.
   */
  async refresh(refreshToken: string, expectedSubject: string): Promise<OidcIdentity> {
    const configuration = await this.discover();
    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.refreshTokenGrant(configuration, refreshToken);
    } catch (error) {
      if (error instanceof oidc.ResponseBodyError && error.status >= 400 && error.status < 500) {
        throw new RefreshRejectedError(error.error);
      }
      throw this.wrap(error, 'refresh');
    }
    const claims =
      (tokens.claims() as Claims | undefined) ??
      ((await oidc.fetchUserInfo(configuration, tokens.access_token, expectedSubject)) as Claims);
    if (claims['sub'] !== expectedSubject) throw new RefreshRejectedError('utente diverso');
    return this.identity(claims, { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken });
  }

  /** Logout anche su ZITADEL (chiude il single sign-on), poi ritorno a `/uscito`. */
  async endSessionUrl(idToken: string | null): Promise<string> {
    try {
      const configuration = await this.discover();
      return oidc
        .buildEndSessionUrl(configuration, {
          post_logout_redirect_uri: this.postLogoutRedirectUri,
          ...(idToken ? { id_token_hint: idToken } : { client_id: this.config.oidc.clientId }),
        })
        .toString();
    } catch {
      // ZITADEL irraggiungibile: si esce almeno da Dimmelo
      return this.postLogoutRedirectUri;
    }
  }

  private identity(
    claims: Claims,
    tokens: { refresh_token?: string; id_token?: string },
  ): OidcIdentity {
    const sub = claims['sub'];
    if (typeof sub !== 'string' || !sub) throw new LoginRejectedError('Token senza utente');
    const email = typeof claims['email'] === 'string' ? claims['email'].toLowerCase() : null;
    const name =
      [claims['name'], claims['preferred_username'], email].find(
        (v): v is string => typeof v === 'string' && v.trim() !== '',
      ) ?? sub;
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
  private discover(): Promise<oidc.Configuration> {
    this.configuration ??= oidc
      .discovery(
        new URL(this.config.zitadel.url),
        this.config.oidc.clientId,
        undefined,
        oidc.ClientSecretBasic(this.config.oidc.clientSecret),
        new URL(this.config.zitadel.url).protocol === 'http:'
          ? { execute: [oidc.allowInsecureRequests] }
          : undefined,
      )
      .catch((error: unknown) => {
        this.configuration = undefined;
        throw this.wrap(error, 'discovery');
      });
    return this.configuration;
  }

  private wrap(error: unknown, step: string): Error {
    const detail =
      error instanceof oidc.ResponseBodyError
        ? `${error.status} ${error.error}`
        : (error as Error).message;
    console.error(`[oidc] ${step}: ${detail}`);
    return badGateway('Servizio di identità non raggiungibile o risposta non valida');
  }
}

/**
 * Ruoli del progetto nei claim di ZITADEL: `urn:zitadel:iam:org:project:<id>:roles` (o il
 * claim generico), oggetti `{ "<ruolo>": { "<orgId>": "<dominio>" } }`. Si tengono solo i
 * ruoli che sono permessi dell'app.
 */
export function rolesFromClaims(claims: Claims, projectId: string): Permission[] {
  const roles =
    claims[`urn:zitadel:iam:org:project:${projectId}:roles`] ??
    claims['urn:zitadel:iam:org:project:roles'];
  if (!roles || typeof roles !== 'object') return [];
  return Object.keys(roles).filter(isPermission).sort();
}
