import type { Request, Response } from 'express';
import { Abstract_Controller } from './abstract.controller.js';
import type { Environment } from '../environment.js';
import { toCurrentUserDto } from '../lib/auth/auth-mapper.js';
import { SESSION_COOKIE } from '../lib/auth/auth-types.js';
import { parseCredential } from '../lib/auth/passkey-credential.js';
import { badRequest } from '../lib/http-error.js';

const token = (req: Request): string => String(req.params['token'] ?? '');

/**
 * Link d'accesso (invito e recupero), su `/api/invites`. Pubblici: chi li apre non ha ancora
 * una passkey. L'accesso è protetto dal token del link: casuale, monouso, con scadenza.
 */
export class InvitesController extends Abstract_Controller {
  constructor(env: Environment) {
    super(env, 'invites');
    const { guard } = env.auth;
    this.router.get('/:token', guard.public(), this.status.bind(this));
    this.router.post('/:token/passkey/start', guard.public(), this.start.bind(this));
    this.router.post('/:token/passkey/finish', guard.public(), this.finish.bind(this));
  }

  private async status(req: Request, res: Response): Promise<void> {
    res.send(await this.env.auth.invites.status(token(req)));
  }

  private async start(req: Request, res: Response): Promise<void> {
    res.send(await this.env.auth.invites.startPasskey(token(req)));
  }

  private async finish(req: Request, res: Response): Promise<void> {
    const input = (req.body ?? {}) as { passkeyId?: unknown; credential?: unknown };
    if (typeof input.passkeyId !== 'string' || !input.passkeyId || input.passkeyId.length > 100) {
      throw badRequest('Passkey non valida');
    }
    const { user, session } = await this.env.auth.invites.finishPasskey(
      token(req),
      input.passkeyId,
      parseCredential(input.credential),
      req.get('user-agent') ?? null,
    );
    res.cookie(SESSION_COOKIE, session.token, this.env.auth.sessions.cookieOptions(session.expiresAt));
    res.send(toCurrentUserDto(user));
  }
}
