import type { ZitadelConfig } from '../auth-config.js';
import { badGateway, conflict } from './http-error.js';

/** Utente di ZITADEL (i soli campi usati). */
export interface ZitadelUser {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
}

export interface ZitadelUserInput {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

/** Accesso di un utente al progetto (user grant): i ruoli sono i permessi di Dimmelo. */
export interface ZitadelGrant {
  grantId: string;
  userId: string;
  roleKeys: string[];
  active: boolean;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  createdAt: string;
}

/** Errore restituito da ZITADEL, con lo status HTTP e l'id dell'errore (es. `COMMAND-Eeb2a`). */
export class ZitadelError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly id: string | undefined,
  ) {
    super(message);
  }
}

interface GrantJson {
  id: string;
  userId: string;
  roleKeys?: string[];
  state?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  details?: { creationDate?: string };
}

interface UserJson {
  userId: string;
  details?: { resourceOwner?: string };
  human?: {
    profile?: { givenName?: string; familyName?: string; displayName?: string };
    email?: { email?: string };
  };
}

/**
 * Client delle API di gestione di ZITADEL con il token del service account di palio (mai nel
 * browser): utenti (condivisi con le altre app) e loro accesso al progetto Dimmelo.
 * Il login invece passa da OIDC (`lib/auth/oidc-client.ts`).
 */
export class ZitadelService {
  private orgId?: Promise<string>;

  constructor(private readonly config: ZitadelConfig) {}

  /** Utente umano con quella email (senza distinzione di maiuscole), se esiste. */
  async findUserByEmail(email: string): Promise<ZitadelUser | null> {
    const { result } = await this.request<{ result?: UserJson[] }>('POST', '/v2/users', {
      query: { limit: 2 },
      queries: [
        { emailQuery: { emailAddress: email, method: 'TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE' } },
        { typeQuery: { type: 'TYPE_HUMAN' } },
      ],
    });
    if ((result?.length ?? 0) > 1) {
      throw conflict(`Su ZITADEL ci sono più account con l'email ${email}`);
    }
    return result?.[0] ? toUser(result[0]) : null;
  }

  async getUser(userId: string): Promise<ZitadelUser> {
    const { user } = await this.request<{ user: UserJson }>('GET', `/v2/users/${enc(userId)}`);
    return toUser(user);
  }

  /**
   * Crea l'utente con email già verificata: chi lo invita garantisce l'indirizzo, e così il
   * collegamento automatico con Google (stessa email) funziona.
   */
  async createUser(input: ZitadelUserInput): Promise<string> {
    const { id } = await this.request<{ id: string }>('POST', '/v2/users/new', {
      organizationId: await this.organizationId(),
      username: input.email,
      human: {
        profile: { givenName: input.firstName, familyName: input.lastName, displayName: input.displayName },
        email: { email: input.email, isVerified: true },
      },
    });
    return id;
  }

  async updateUser(userId: string, input: ZitadelUserInput): Promise<void> {
    await this.request('PATCH', `/v2/users/${enc(userId)}`, {
      human: {
        profile: { givenName: input.firstName, familyName: input.lastName, displayName: input.displayName },
        email: { email: input.email, isVerified: true },
      },
    });
  }

  /**
   * Link monouso per registrare una passkey sulla pagina di login di ZITADEL. ZITADEL restituisce
   * il codice (non manda email): il link lo condivide chi invita. Con il Login V2 il link è di
   * Dimmelo (`/api/auth/invito`): avvia un login e registra la passkey dentro quello, così
   * l'utente finisce in Dimmelo; la pagina del Login V2 non chiede il nome del dispositivo.
   */
  async passkeyRegistrationLink(userId: string, appUrl: string): Promise<string> {
    const { code } = await this.request<{ code: { id: string; code: string } }>(
      'POST',
      `/v2/users/${enc(userId)}/passkeys/registration_link`,
      { returnCode: {} },
    );
    const organization = await this.organizationId();
    if (this.config.loginV2) {
      const params = new URLSearchParams({ userId, organization, codeId: code.id, code: code.code });
      return `${appUrl}/api/auth/invito?${params.toString()}`;
    }
    const params = new URLSearchParams({ userID: userId, orgID: organization, codeID: code.id, code: code.code });
    return `${this.config.url}/ui/login/login/passwordless/init?${params.toString()}`;
  }

  /**
   * L'utente sa già entrare: ha una passkey o un login esterno collegato (es. Google). In quel
   * caso non va mandato a registrare un'altra passkey: sul dispositivo dove ce l'ha già il
   * browser rifiuta di crearne una seconda ("The object is in an invalid state").
   */
  async hasLoginMethod(userId: string): Promise<boolean> {
    const { authMethodTypes } = await this.request<{ authMethodTypes?: string[] }>(
      'GET',
      `/v2/users/${enc(userId)}/authentication_methods`,
    );
    return (authMethodTypes ?? []).some(
      (t) => t === 'AUTHENTICATION_METHOD_TYPE_PASSKEY' || t === 'AUTHENTICATION_METHOD_TYPE_IDP',
    );
  }

  /** Accessi al progetto Dimmelo (tutti, o di un utente). */
  async listGrants(userId?: string): Promise<ZitadelGrant[]> {
    const grants: ZitadelGrant[] = [];
    const limit = 500;
    for (let offset = 0; ; offset += limit) {
      const { result } = await this.request<{ result?: GrantJson[] }>(
        'POST',
        '/management/v1/users/grants/_search',
        {
          query: { offset: String(offset), limit, asc: true },
          queries: [
            { projectIdQuery: { projectId: this.config.projectId } },
            ...(userId ? [{ userIdQuery: { userId } }] : []),
          ],
        },
      );
      grants.push(...(result ?? []).map(toGrant));
      if ((result?.length ?? 0) < limit) return grants;
    }
  }

  async addGrant(userId: string, roleKeys: readonly string[]): Promise<void> {
    await this.request('POST', `/management/v1/users/${enc(userId)}/grants`, {
      projectId: this.config.projectId,
      roleKeys,
    });
  }

  async updateGrant(userId: string, grantId: string, roleKeys: readonly string[]): Promise<void> {
    await this.request('PUT', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}`, {
      roleKeys,
    });
  }

  async deactivateGrant(userId: string, grantId: string): Promise<void> {
    await this.request('POST', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}/_deactivate`, {});
  }

  async reactivateGrant(userId: string, grantId: string): Promise<void> {
    await this.request('POST', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}/_reactivate`, {});
  }

  async removeGrant(userId: string, grantId: string): Promise<void> {
    await this.request('DELETE', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}`);
  }

  /** Organizzazione degli utenti: configurata o quella del service account (in cache). */
  private organizationId(): Promise<string> {
    if (this.config.organizationId) return Promise.resolve(this.config.organizationId);
    this.orgId ??= this.request<{ user: { details: { resourceOwner: string } } }>('GET', '/auth/v1/users/me')
      .then((me) => me.user.details.resourceOwner)
      .catch((error: unknown) => {
        this.orgId = undefined;
        throw error;
      });
    return this.orgId;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.config.token) {
      throw badGateway('Gestione utenti non configurata (manca ZITADEL_TOKEN)');
    }
    // le API v1 di gestione lavorano nel contesto di un'organizzazione
    const orgHeader: Record<string, string> =
      path.startsWith('/management/') ? { 'x-zitadel-orgid': await this.organizationId() } : {};
    let response: Response;
    try {
      response = await fetch(`${this.config.url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/json',
          ...orgHeader,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.error(`[zitadel] ${method} ${path}: ${(error as Error).message}`);
      throw badGateway('Servizio di identità non raggiungibile');
    }
    const text = await response.text();
    if (!response.ok) {
      const { message, id } = parseError(text);
      console.warn(`[zitadel] ${method} ${path} → ${response.status}: ${message ?? response.statusText}`);
      throw new ZitadelError(response.status, message ?? response.statusText, id);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}

const enc = encodeURIComponent;

function toUser(json: UserJson): ZitadelUser {
  const profile = json.human?.profile ?? {};
  return {
    userId: json.userId,
    firstName: profile.givenName ?? '',
    lastName: profile.familyName ?? '',
    displayName: profile.displayName ?? '',
    email: json.human?.email?.email ?? '',
  };
}

function toGrant(json: GrantJson): ZitadelGrant {
  return {
    grantId: json.id,
    userId: json.userId,
    roleKeys: json.roleKeys ?? [],
    active: json.state !== 'USER_GRANT_STATE_INACTIVE',
    firstName: json.firstName ?? '',
    lastName: json.lastName ?? '',
    displayName: json.displayName ?? '',
    email: json.email ?? '',
    createdAt: json.details?.creationDate ?? new Date(0).toISOString(),
  };
}

function parseError(body: string): { message?: string; id?: string } {
  try {
    const parsed = JSON.parse(body) as { message?: unknown; details?: { id?: unknown }[] };
    return {
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
      id: typeof parsed.details?.[0]?.id === 'string' ? parsed.details[0].id : undefined,
    };
  } catch {
    return { message: body ? body.slice(0, 200) : undefined };
  }
}

/** Traduce gli errori di ZITADEL in risposte HTTP comprensibili per il frontend. */
export function toHttpError(error: unknown): unknown {
  if (!(error instanceof ZitadelError)) return error;
  if (error.status === 401 || error.status === 403) {
    return badGateway('Token di ZITADEL non valido o senza permessi');
  }
  if (error.status === 400 || error.status === 409) {
    return conflict(`ZITADEL ha rifiutato i dati: ${error.message}`);
  }
  if (error.status === 404) {
    return conflict('Utente non trovato su ZITADEL');
  }
  return badGateway(`Errore del servizio di identità (${error.status})`);
}
