import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import type { Environment } from '../environment.js';
import { currentUser } from '../lib/auth/auth-guard.js';
import { PERMISSION_CATALOG } from '../lib/auth/permissions.js';
import { badRequest } from '../lib/http-error.js';
import { parseUserInput } from '../lib/users/users-validation.js';

/** Id dell'utente su ZITADEL (numerico, in forma di stringa). */
function idParam(req: Request): string {
  const id = String(req.params['id'] ?? '');
  if (!/^\d{1,30}$/.test(id)) throw badRequest('Id non valido');
  return id;
}

/**
 * Utenti con accesso a Dimmelo (`/api/users`, accessi al progetto su ZITADEL): vedere con
 * `users.view`, il resto con `users.manage`. Catalogo dei permessi su `/api/permissions`.
 */
export class UsersController extends Abstract_Controller {
  constructor(env: Environment) {
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

  private get users() {
    return this.env.auth.users;
  }

  private async list(_req: Request, res: Response): Promise<void> {
    res.send(await this.users.list());
  }

  private async get(req: Request, res: Response): Promise<void> {
    res.send(await this.users.get(idParam(req)));
  }

  private async create(req: Request, res: Response): Promise<void> {
    res.status(201).send(await this.users.create(parseUserInput(req.body), currentUser(req)));
  }

  private async update(req: Request, res: Response): Promise<void> {
    res.send(await this.users.update(idParam(req), parseUserInput(req.body), currentUser(req)));
  }

  private async invite(req: Request, res: Response): Promise<void> {
    res.status(201).send(await this.users.invite(idParam(req), currentUser(req)));
  }

  private async disable(req: Request, res: Response): Promise<void> {
    res.send(await this.users.disable(idParam(req), currentUser(req)));
  }

  private async enable(req: Request, res: Response): Promise<void> {
    res.send(await this.users.enable(idParam(req), currentUser(req)));
  }

  private async remove(req: Request, res: Response): Promise<void> {
    await this.users.remove(idParam(req), currentUser(req));
    res.status(204).end();
  }
}
