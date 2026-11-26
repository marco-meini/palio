import { Abstract_Controller } from './abstract.controller.js';
import { currentUser } from '../lib/auth/auth-guard.js';
import { PERMISSION_CATALOG } from '../lib/auth/permissions.js';
import { badRequest } from '../lib/http-error.js';
import { parseUserInput } from '../lib/users/users-validation.js';
/** Id dell'utente su ZITADEL (numerico, in forma di stringa). */
function idParam(req) {
    const id = String(req.params['id'] ?? '');
    if (!/^\d{1,30}$/.test(id))
        throw badRequest('Id non valido');
    return id;
}
/**
 * Utenti con accesso a Dimmelo (`/api/users`, accessi al progetto su ZITADEL): vedere con
 * `users.view`, il resto con `users.manage`. Catalogo dei permessi su `/api/permissions`.
 */
export class UsersController extends Abstract_Controller {
    constructor(env) {
        super(env, 'users');
        const { guard } = env.auth;
        const view = guard.require('users.view');
        const manage = guard.require('users.manage');
        this.router.get('/permissions', view, (_req, res) => {
            res.send(PERMISSION_CATALOG);
        });
        this.router.get('/users', view, this.list.bind(this));
        this.router.get('/users/:id', view, this.get.bind(this));
        this.router.post('/users', manage, this.create.bind(this));
        this.router.put('/users/:id', manage, this.update.bind(this));
        this.router.post('/users/:id/invite', manage, this.invite.bind(this));
        this.router.post('/users/:id/disable', manage, this.disable.bind(this));
        this.router.post('/users/:id/enable', manage, this.enable.bind(this));
        this.router.delete('/users/:id', manage, this.remove.bind(this));
    }
    get users() {
        return this.env.auth.users;
    }
    async list(_req, res) {
        res.send(await this.users.list());
    }
    async get(req, res) {
        res.send(await this.users.get(idParam(req)));
    }
    async create(req, res) {
        res.status(201).send(await this.users.create(parseUserInput(req.body), currentUser(req)));
    }
    async update(req, res) {
        res.send(await this.users.update(idParam(req), parseUserInput(req.body), currentUser(req)));
    }
    async invite(req, res) {
        res.status(201).send(await this.users.invite(idParam(req), currentUser(req)));
    }
    async disable(req, res) {
        res.send(await this.users.disable(idParam(req), currentUser(req)));
    }
    async enable(req, res) {
        res.send(await this.users.enable(idParam(req), currentUser(req)));
    }
    async remove(req, res) {
        await this.users.remove(idParam(req), currentUser(req));
        res.status(204).end();
    }
}
//# sourceMappingURL=users.controller.js.map