import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../http-error.js';
import { type AuthRequest, type AuthUser, SESSION_COOKIE } from './auth-types.js';
import { hasPermissions, type Permission } from './permissions.js';
import type { SessionService } from './session-service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cosa serve per usare un endpoint. Ogni rotta lo dichiara: non esiste un default.
 * - `public()`: nemmeno il login (usarlo solo quando serve davvero)
 * - `anyUser()`: basta essere autenticati (es. `/auth/me`)
 * - `require(...permessi)`: servono tutti i permessi indicati (l'amministratore li ha tutti)
 *
 * In ogni caso, per le richieste non-GET l'header Origin deve essere quello dell'app
 * (protezione CSRF), e se c'è un cookie di sessione valido l'utente finisce in `req.user`.
 */
export interface AuthGuard {
  public(): RequestHandler;
  anyUser(): RequestHandler;
  require(...permissions: Permission[]): RequestHandler;
}

export function createAuthGuard(sessions: SessionService, appUrl: string): AuthGuard {
  const sameOrigin = (req: Request): boolean => {
    const origin = req.get('origin');
    if (origin) return origin === appUrl;
    const referer = req.get('referer');
    return !!referer && (referer === appUrl || referer.startsWith(`${appUrl}/`));
  };

  const middleware =
    (check: (user: AuthUser | undefined) => void): RequestHandler =>
    async (req: Request, _res: Response, next: NextFunction) => {
      const request = req as AuthRequest;
      if (!SAFE_METHODS.has(request.method) && !sameOrigin(request)) {
        throw forbidden('Origine della richiesta non consentita');
      }
      const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
      if (token) {
        const user = await sessions.validate(token);
        if (user) {
          request.user = user;
          request.sessionToken = token;
        }
      }
      check(request.user);
      next();
    };

  return {
    public: () => middleware(() => undefined),
    anyUser: () =>
      middleware((user) => {
        if (!user) throw unauthorized();
      }),
    require: (...permissions: Permission[]) => {
      if (permissions.length === 0) throw new Error('require(): indicare almeno un permesso');
      return middleware((user) => {
        if (!user) throw unauthorized();
        if (!hasPermissions(user, permissions)) {
          throw forbidden('Non hai il permesso per questa operazione');
        }
      });
    },
  };
}

/** Utente autenticato della richiesta (dopo `anyUser()` o `require()`). */
export function currentUser(req: Request): AuthUser {
  const user = (req as AuthRequest).user;
  if (!user) throw unauthorized();
  return user;
}
