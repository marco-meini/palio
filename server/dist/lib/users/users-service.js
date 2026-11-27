import { effectivePermissions } from '../auth/permissions.js';
import { conflict, forbidden, notFound } from '../http-error.js';
import { inviteMail } from '../mail/invite-mail.js';
import { toHttpError } from '../zitadel.js';
import { toUserDto } from './users-mapper.js';
import { fullName } from './users-validation.js';
/**
 * Utenti di Dimmelo: chi ha accesso al progetto Dimmelo su ZITADEL (user grant) e con quali
 * ruoli. ZITADEL è la fonte di verità; palio aggiunge solo l'ultimo accesso. Gli utenti stanno
 * nell'organizzazione di Dimmelo su ZITADEL (ogni app ha la sua): togliere l'accesso a Dimmelo
 * non cancella l'account.
 *
 * Regole: si gestiscono solo utenti con permessi che si hanno anche (cambiandogli l'email e
 * mandando un invito se ne prenderebbe il posto), si assegnano solo permessi propri, nessuno
 * cambia i propri permessi e deve restare almeno un utente attivo che gestisce gli utenti.
 */
export class UsersService {
    zitadel;
    repository;
    appUrl;
    mailer;
    constructor(zitadel, repository, appUrl, 
    /** Invio delle email d'invito; senza, l'invito è solo il link da copiare. */
    mailer) {
        this.zitadel = zitadel;
        this.repository = repository;
        this.appUrl = appUrl;
        this.mailer = mailer;
    }
    async list() {
        const grants = await this.call(() => this.zitadel.listGrants());
        const logins = await this.repository.lastLogins(grants.map((g) => g.userId));
        return grants
            .map((g) => toUserDto(g, logins.get(g.userId)))
            .sort((a, b) => Number(a.status === 'disabled') - Number(b.status === 'disabled') ||
            a.lastName.localeCompare(b.lastName, 'it', { sensitivity: 'base' }) ||
            a.firstName.localeCompare(b.firstName, 'it', { sensitivity: 'base' }));
    }
    async get(id) {
        return this.dto(await this.find(id));
    }
    /**
     * Dà accesso a Dimmelo: collega l'account ZITADEL con quella email (es. già usato in
     * un'altra app) o lo crea, assegna i ruoli e prepara l'invito (passkey o, se sa già entrare,
     * il link di Dimmelo), mandato anche per email se l'invio è configurato.
     */
    async create(input, actor) {
        this.checkAssignment(actor, input.permissions);
        return this.call(async () => {
            const existing = await this.zitadel.findUserByEmail(input.email);
            if (existing && (await this.zitadel.listGrants(existing.userId)).length > 0) {
                throw conflict('Questa persona ha già accesso a Dimmelo');
            }
            const userId = existing?.userId ??
                (await this.zitadel.createUser({
                    ...input,
                    displayName: fullName(input.firstName, input.lastName),
                }));
            await this.zitadel.addGrant(userId, input.permissions);
            console.info(`[users] Accesso a Dimmelo per ${userId} (${existing ? 'account esistente' : 'nuovo account'})`);
            const user = await this.find(userId);
            return { user: await this.dto(user), invite: await this.inviteFor(user, actor) };
        });
    }
    async update(id, input, actor) {
        const grant = await this.find(id);
        const self = id === actor.idp_user_id;
        if (self) {
            if (!sameSet(input.permissions, grant.roleKeys)) {
                throw conflict('Non puoi cambiare i tuoi permessi');
            }
        }
        else {
            this.checkCanManage(actor, grant);
            this.checkAssignment(actor, input.permissions);
            if (!effectivePermissions(input.permissions).includes('users.manage')) {
                await this.ensureOtherManager(grant);
            }
        }
        return this.call(async () => {
            if (input.email !== grant.email.toLowerCase()) {
                const sameEmail = await this.zitadel.findUserByEmail(input.email);
                if (sameEmail && sameEmail.userId !== id) {
                    throw conflict('Esiste già un account con questa email');
                }
            }
            const displayName = fullName(input.firstName, input.lastName);
            if (input.firstName !== grant.firstName ||
                input.lastName !== grant.lastName ||
                input.email !== grant.email.toLowerCase()) {
                await this.zitadel.updateUser(id, { ...input, displayName });
            }
            if (!sameSet(input.permissions, grant.roleKeys)) {
                // le sessioni aperte prendono i nuovi permessi al prossimo refresh (entro 5 minuti)
                await this.zitadel.updateGrant(id, grant.grantId, input.permissions);
            }
            return this.dto(await this.find(id));
        });
    }
    /** Nuovo invito (es. il link precedente è scaduto), mandato anche per email se configurata. */
    async invite(id, actor) {
        const grant = await this.find(id);
        this.checkCanManage(actor, grant);
        if (!grant.active)
            throw conflict("L'accesso dell'utente è disattivato");
        return this.call(() => this.inviteFor(grant, actor));
    }
    /** Sospende l'accesso a Dimmelo (i ruoli restano) e chiude le sessioni aperte. */
    async disable(id, actor) {
        if (id === actor.idp_user_id)
            throw conflict('Non puoi disattivare te stesso');
        const grant = await this.find(id);
        this.checkCanManage(actor, grant);
        if (!grant.active)
            return this.dto(grant);
        await this.ensureOtherManager(grant);
        await this.call(() => this.zitadel.deactivateGrant(id, grant.grantId));
        await this.repository.deleteSessions(id);
        return this.dto({ ...grant, active: false });
    }
    async enable(id, actor) {
        const grant = await this.find(id);
        this.checkCanManage(actor, grant);
        if (grant.active)
            return this.dto(grant);
        await this.call(() => this.zitadel.reactivateGrant(id, grant.grantId));
        return this.dto({ ...grant, active: true });
    }
    /** Toglie l'accesso a Dimmelo. L'account su ZITADEL e le passkey restano. */
    async remove(id, actor) {
        if (id === actor.idp_user_id)
            throw conflict('Non puoi eliminare te stesso');
        const grant = await this.find(id);
        this.checkCanManage(actor, grant);
        if (grant.active)
            await this.ensureOtherManager(grant);
        await this.call(() => this.zitadel.removeGrant(id, grant.grantId));
        await this.repository.deleteSessions(id);
    }
    /** Si gestiscono solo utenti con permessi che si hanno anche. */
    checkCanManage(actor, grant) {
        const own = effectivePermissions(actor.permissions);
        if (!effectivePermissions(grant.roleKeys).every((p) => own.includes(p))) {
            throw forbidden('Non puoi gestire un utente che ha permessi che tu non hai');
        }
    }
    /** Si assegnano solo permessi che si hanno anche. */
    checkAssignment(actor, permissions) {
        const own = effectivePermissions(actor.permissions);
        if (!effectivePermissions(permissions).every((p) => own.includes(p))) {
            throw forbidden('Puoi assegnare solo i permessi che hai anche tu');
        }
    }
    /** Deve restare almeno un altro utente attivo che gestisce gli utenti. */
    async ensureOtherManager(grant) {
        if (!grant.active || !effectivePermissions(grant.roleKeys).includes('users.manage'))
            return;
        const grants = await this.call(() => this.zitadel.listGrants());
        const others = grants.filter((g) => g.userId !== grant.userId && g.active && effectivePermissions(g.roleKeys).includes('users.manage'));
        if (others.length === 0) {
            throw conflict('Deve restare almeno un utente attivo che gestisce gli utenti');
        }
    }
    async find(id) {
        const [grant] = await this.call(() => this.zitadel.listGrants(id));
        if (!grant)
            throw notFound('Utente non trovato');
        return grant;
    }
    async dto(grant) {
        const logins = await this.repository.lastLogins([grant.userId]);
        return toUserDto(grant, logins.get(grant.userId));
    }
    async inviteFor(grant, actor) {
        const { userId } = grant;
        const invite = (await this.zitadel.hasLoginMethod(userId))
            ? { kind: 'login', url: this.appUrl }
            : { kind: 'passkey', url: await this.zitadel.passkeyRegistrationLink(userId, this.appUrl) };
        if (!this.mailer || !grant.email)
            return invite;
        return { ...invite, mail: { to: grant.email, sent: await this.sendInvite(invite, grant, actor) } };
    }
    /** Un invio non riuscito non blocca l'invito: resta il link da copiare. */
    async sendInvite(invite, grant, actor) {
        try {
            await this.mailer.send(inviteMail({
                invite,
                name: grant.firstName || grant.displayName,
                email: grant.email,
                inviter: actor.display_name,
                appUrl: this.appUrl,
            }));
            console.info(`[users] Email d'invito (${invite.kind}) inviata a ${grant.userId}`);
            return true;
        }
        catch (error) {
            console.error(`[users] Email d'invito a ${grant.userId} non inviata:`, error instanceof Error ? error.message : error);
            return false;
        }
    }
    async call(fn) {
        try {
            return await fn();
        }
        catch (error) {
            throw toHttpError(error);
        }
    }
}
function sameSet(a, b) {
    const left = new Set(a);
    const right = new Set(b);
    return left.size === right.size && [...left].every((x) => right.has(x));
}
//# sourceMappingURL=users-service.js.map