import type { AuthConfig } from '../../auth-config.js';
import { ModelAuth } from '../../model/auth.model.js';
import { ModelUsers } from '../../model/users.model.js';
import { createDb } from '../db.js';
import type { PgClientManager } from '../pg-client-manager.js';
import { UsersService } from '../users/users-service.js';
import { ZitadelService } from '../zitadel.js';
import { type AuthGuard, createAuthGuard } from './auth-guard.js';
import { AuthService } from './auth-service.js';
import { OidcClient } from './oidc-client.js';
import { SessionService } from './session-service.js';
import { TokenCrypto } from './token-crypto.js';

/** Servizi di autenticazione e gestione utenti, collegati una volta all'avvio dell'API. */
export interface AuthServices {
  config: AuthConfig;
  guard: AuthGuard;
  sessions: SessionService;
  auth: AuthService;
  users: UsersService;
}

export function createAuthServices(pg: PgClientManager, config: AuthConfig): AuthServices {
  const db = createDb(pg);
  const authModel = new ModelAuth(db);
  const oidc = new OidcClient(config);
  const sessions = new SessionService(authModel, oidc, new TokenCrypto(config.cookieSecret), config);
  return {
    config,
    guard: createAuthGuard(sessions, config.appUrl),
    sessions,
    auth: new AuthService(oidc, sessions, authModel),
    users: new UsersService(new ZitadelService(config.zitadel), new ModelUsers(db)),
  };
}
