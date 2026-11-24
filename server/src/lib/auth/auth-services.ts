import type { AuthConfig } from '../../auth-config.js';
import { ModelAuth } from '../../model/auth.model.js';
import { ModelUsers } from '../../model/users.model.js';
import { createDb } from '../db.js';
import { MailService } from '../mail.js';
import type { PgClientManager } from '../pg-client-manager.js';
import { AccountsService } from '../users/accounts-service.js';
import { InvitesService } from '../users/invites-service.js';
import { RecoveryService } from '../users/recovery-service.js';
import { UsersService } from '../users/users-service.js';
import { ZitadelService } from '../zitadel.js';
import { type AuthGuard, createAuthGuard } from './auth-guard.js';
import { AuthService } from './auth-service.js';
import { SessionService } from './session-service.js';

/** Servizi di autenticazione e gestione utenti, collegati una volta all'avvio dell'API. */
export interface AuthServices {
  config: AuthConfig;
  guard: AuthGuard;
  sessions: SessionService;
  auth: AuthService;
  invites: InvitesService;
  recovery: RecoveryService;
  users: UsersService;
}

export function createAuthServices(pg: PgClientManager, config: AuthConfig): AuthServices {
  const db = createDb(pg);
  const usersModel = new ModelUsers(db);
  const zitadel = new ZitadelService(config);
  const sessions = new SessionService(new ModelAuth(db), config);
  const auth = new AuthService(zitadel, sessions, new ModelAuth(db));
  const accounts = new AccountsService(usersModel, zitadel);
  const invites = new InvitesService(config, usersModel, accounts, zitadel, auth);
  return {
    config,
    guard: createAuthGuard(sessions, config.appUrl),
    sessions,
    auth,
    invites,
    recovery: new RecoveryService(config, usersModel, invites, new MailService(config)),
    users: new UsersService(db, accounts, invites),
  };
}
