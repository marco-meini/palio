import type { AuthConfig } from '../auth-config.js';
import type { PasskeyCredentialDto, WebAuthnOptionsJson } from './auth/dto.js';
import { badGateway, conflict } from './http-error.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Utente di ZITADEL (i soli campi usati della User Service v2). */
export interface ZitadelUser {
  userId: string;
}

export interface ZitadelUserInput {
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
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

/**
 * Client delle API v2 di ZITADEL con il token del service account di palio (mai nel browser).
 * palio usa ZITADEL in modalità "headless": le schermate sono di palio, ZITADEL tiene le
 * identità condivise tra le app e verifica le passkey.
 */
export class ZitadelService {
  private orgId?: Promise<string>;

  constructor(private readonly config: AuthConfig) {
    const url = new URL(config.zitadel.url);
    if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
      throw new Error('ZITADEL_URL deve usare https (http è ammesso solo su localhost)');
    }
  }

  /** Utente umano con quella email (senza distinzione di maiuscole), se esiste. */
  async findUserByEmail(email: string): Promise<ZitadelUser | null> {
    const { result } = await this.request<{ result?: ZitadelUser[] }>('POST', '/v2/users', {
      query: { limit: 2 },
      queries: [
        { emailQuery: { emailAddress: email, method: 'TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE' } },
        { typeQuery: { type: 'TYPE_HUMAN' } },
      ],
    });
    if ((result?.length ?? 0) > 1) {
      throw conflict(`Su ZITADEL ci sono più account con l'email ${email}`);
    }
    return result?.[0] ?? null;
  }

  /** Crea l'utente con email già verificata (la verifica la fa il link inviato da palio). */
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

  async deleteUser(userId: string): Promise<void> {
    await this.request('DELETE', `/v2/users/${enc(userId)}`);
  }

  /** Avvia la registrazione di una passkey sul dominio delle passkey di palio. */
  async startPasskeyRegistration(userId: string): Promise<{ passkeyId: string; options: WebAuthnOptionsJson }> {
    const res = await this.request<{ passkeyId: string; publicKeyCredentialCreationOptions: WebAuthnOptionsJson }>(
      'POST',
      `/v2/users/${enc(userId)}/passkeys`,
      { authenticator: 'PASSKEY_AUTHENTICATOR_UNSPECIFIED', domain: this.config.passkey.rpId },
    );
    return { passkeyId: res.passkeyId, options: unwrapPublicKey(res.publicKeyCredentialCreationOptions) };
  }

  async finishPasskeyRegistration(
    userId: string,
    passkeyId: string,
    credential: PasskeyCredentialDto,
    name: string,
  ): Promise<void> {
    await this.request('POST', `/v2/users/${enc(userId)}/passkeys/${enc(passkeyId)}`, {
      publicKeyCredential: credential,
      passkeyName: name,
    });
  }

  /** Crea una sessione ZITADEL per l'utente con una challenge WebAuthn. */
  async startLogin(userId: string): Promise<{ sessionId: string; options: WebAuthnOptionsJson }> {
    const res = await this.request<{
      sessionId: string;
      challenges: { webAuthN: { publicKeyCredentialRequestOptions: WebAuthnOptionsJson } };
    }>('POST', '/v2/sessions', {
      checks: { user: { userId } },
      challenges: {
        webAuthN: { domain: this.config.passkey.rpId, userVerificationRequirement: 'USER_VERIFICATION_REQUIREMENT_REQUIRED' },
      },
    });
    return {
      sessionId: res.sessionId,
      options: unwrapPublicKey(res.challenges.webAuthN.publicKeyCredentialRequestOptions),
    };
  }

  /**
   * Fa verificare a ZITADEL la firma della passkey e restituisce l'utente della sessione.
   * La sessione ZITADEL serve solo a questo: poi viene eliminata (palio ha la sua).
   */
  async finishLogin(sessionId: string, credential: PasskeyCredentialDto): Promise<string> {
    try {
      await this.request('PATCH', `/v2/sessions/${enc(sessionId)}`, {
        checks: { webAuthN: { credentialAssertionData: credential } },
      });
      const { session } = await this.request<{
        session: { factors?: { user?: { id?: string }; webAuthN?: { verifiedAt?: string; userVerified?: boolean } } };
      }>('GET', `/v2/sessions/${enc(sessionId)}`);
      const userId = session.factors?.user?.id;
      if (!userId || !session.factors?.webAuthN?.verifiedAt || !session.factors.webAuthN.userVerified) {
        throw new ZitadelError(401, 'Passkey non verificata', undefined);
      }
      return userId;
    } finally {
      await this.request('DELETE', `/v2/sessions/${enc(sessionId)}`, {}).catch(() => undefined);
    }
  }

  /** Organizzazione degli utenti: configurata o quella del service account (in cache). */
  private organizationId(): Promise<string> {
    if (this.config.zitadel.organizationId) return Promise.resolve(this.config.zitadel.organizationId);
    this.orgId ??= this.request<{ user: { details: { resourceOwner: string } } }>('GET', '/auth/v1/users/me')
      .then((me) => me.user.details.resourceOwner)
      .catch((error: unknown) => {
        this.orgId = undefined;
        throw error;
      });
    return this.orgId;
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.config.zitadel.url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.zitadel.token}`,
          Accept: 'application/json',
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

/** ZITADEL annida le opzioni in `{ publicKey: … }`: al browser serve l'oggetto interno. */
function unwrapPublicKey(options: WebAuthnOptionsJson): WebAuthnOptionsJson {
  const inner = options['publicKey'];
  return inner && typeof inner === 'object' ? (inner as WebAuthnOptionsJson) : options;
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
  return badGateway(`Errore del servizio di identità (${error.status})`);
}
