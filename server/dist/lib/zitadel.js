import { badGateway, conflict } from './http-error.js';
/** Errore restituito da ZITADEL, con lo status HTTP e l'id dell'errore (es. `COMMAND-Eeb2a`). */
export class ZitadelError extends Error {
    status;
    id;
    constructor(status, message, id) {
        super(message);
        this.status = status;
        this.id = id;
    }
}
/**
 * Client delle API di gestione di ZITADEL con il token del service account di palio (mai nel
 * browser): utenti dell'organizzazione di Dimmelo e loro accesso al progetto Dimmelo.
 * Il login invece passa da OIDC (`lib/auth/oidc-client.ts`).
 */
export class ZitadelService {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Utente umano con quella email (senza distinzione di maiuscole) nell'organizzazione di
     * Dimmelo, se esiste. Gli account delle altre organizzazioni (altre app) non si vedono.
     */
    async findUserByEmail(email) {
        const { result } = await this.request('POST', '/v2/users', {
            query: { limit: 2 },
            queries: [
                { organizationIdQuery: { organizationId: this.config.organizationId } },
                { emailQuery: { emailAddress: email, method: 'TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE' } },
                { typeQuery: { type: 'TYPE_HUMAN' } },
            ],
        });
        if ((result?.length ?? 0) > 1) {
            throw conflict(`Su ZITADEL ci sono più account con l'email ${email}`);
        }
        return result?.[0] ? toUser(result[0]) : null;
    }
    async getUser(userId) {
        const { user } = await this.request('GET', `/v2/users/${enc(userId)}`);
        return toUser(user);
    }
    /**
     * Crea l'utente con email già verificata: chi lo invita garantisce l'indirizzo, e così il
     * collegamento automatico con Google (stessa email) funziona.
     */
    async createUser(input) {
        const { id } = await this.request('POST', '/v2/users/new', {
            organizationId: this.config.organizationId,
            username: input.email,
            human: {
                profile: { givenName: input.firstName, familyName: input.lastName, displayName: input.displayName },
                email: { email: input.email, isVerified: true },
            },
        });
        return id;
    }
    async updateUser(userId, input) {
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
    async passkeyRegistrationLink(userId, appUrl) {
        const { code } = await this.request('POST', `/v2/users/${enc(userId)}/passkeys/registration_link`, { returnCode: {} });
        const organization = this.config.organizationId;
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
    async hasLoginMethod(userId) {
        const { authMethodTypes } = await this.request('GET', `/v2/users/${enc(userId)}/authentication_methods`);
        return (authMethodTypes ?? []).some((t) => t === 'AUTHENTICATION_METHOD_TYPE_PASSKEY' || t === 'AUTHENTICATION_METHOD_TYPE_IDP');
    }
    /** Accessi al progetto Dimmelo (tutti, o di un utente). */
    async listGrants(userId) {
        const grants = [];
        const limit = 500;
        for (let offset = 0;; offset += limit) {
            const { result } = await this.request('POST', '/management/v1/users/grants/_search', {
                query: { offset: String(offset), limit, asc: true },
                queries: [
                    { projectIdQuery: { projectId: this.config.projectId } },
                    ...(userId ? [{ userIdQuery: { userId } }] : []),
                ],
            });
            grants.push(...(result ?? []).map(toGrant));
            if ((result?.length ?? 0) < limit)
                return grants;
        }
    }
    async addGrant(userId, roleKeys) {
        await this.request('POST', `/management/v1/users/${enc(userId)}/grants`, {
            projectId: this.config.projectId,
            roleKeys,
        });
    }
    async updateGrant(userId, grantId, roleKeys) {
        await this.request('PUT', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}`, {
            roleKeys,
        });
    }
    async deactivateGrant(userId, grantId) {
        await this.request('POST', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}/_deactivate`, {});
    }
    async reactivateGrant(userId, grantId) {
        await this.request('POST', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}/_reactivate`, {});
    }
    async removeGrant(userId, grantId) {
        await this.request('DELETE', `/management/v1/users/${enc(userId)}/grants/${enc(grantId)}`);
    }
    async request(method, path, body) {
        if (!this.config.token) {
            throw badGateway('Gestione utenti non configurata (manca ZITADEL_TOKEN)');
        }
        // le API v1 di gestione lavorano nel contesto di un'organizzazione
        const orgHeader = path.startsWith('/management/') ? { 'x-zitadel-orgid': this.config.organizationId } : {};
        let response;
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
        }
        catch (error) {
            console.error(`[zitadel] ${method} ${path}: ${error.message}`);
            throw badGateway('Servizio di identità non raggiungibile');
        }
        const text = await response.text();
        if (!response.ok) {
            const { message, id } = parseError(text);
            console.warn(`[zitadel] ${method} ${path} → ${response.status}: ${message ?? response.statusText}`);
            throw new ZitadelError(response.status, message ?? response.statusText, id);
        }
        return (text ? JSON.parse(text) : {});
    }
}
const enc = encodeURIComponent;
function toUser(json) {
    const profile = json.human?.profile ?? {};
    return {
        userId: json.userId,
        firstName: profile.givenName ?? '',
        lastName: profile.familyName ?? '',
        displayName: profile.displayName ?? '',
        email: json.human?.email?.email ?? '',
    };
}
function toGrant(json) {
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
function parseError(body) {
    try {
        const parsed = JSON.parse(body);
        return {
            message: typeof parsed.message === 'string' ? parsed.message : undefined,
            id: typeof parsed.details?.[0]?.id === 'string' ? parsed.details[0].id : undefined,
        };
    }
    catch {
        return { message: body ? body.slice(0, 200) : undefined };
    }
}
/** Traduce gli errori di ZITADEL in risposte HTTP comprensibili per il frontend. */
export function toHttpError(error) {
    if (!(error instanceof ZitadelError))
        return error;
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
//# sourceMappingURL=zitadel.js.map