import type { NextFunction, Request, Response } from 'express';
import type { Environment } from '../../environment.js';
import { resolveAuthorizedUser, SESSION_COOKIE_NAME } from './session.js';

export function createRequireAuth(env: Environment) {
  const { auth } = env.config;
  const pg = env.pgConnection;

  return async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!auth?.enabled) {
      next();
      return;
    }

    const token = req.cookies?.[SESSION_COOKIE_NAME];
    const user = await resolveAuthorizedUser(pg, token, auth);
    if (!user) {
      res.status(401).send({ error: 'Autenticazione richiesta' });
      return;
    }

    (req as Request & { user?: typeof user }).user = user;
    next();
  };
}
