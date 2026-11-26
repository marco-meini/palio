import { ModelAuth } from '../../model/auth.model.js';
import { ModelUsers } from '../../model/users.model.js';
import { createDb } from '../db.js';
import { UsersService } from '../users/users-service.js';
import { ZitadelService } from '../zitadel.js';
import { createAuthGuard } from './auth-guard.js';
import { AuthService } from './auth-service.js';
import { OidcClient } from './oidc-client.js';
import { SessionService } from './session-service.js';
import { TokenCrypto } from './token-crypto.js';
export function createAuthServices(pg, config) {
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
//# sourceMappingURL=auth-services.js.map