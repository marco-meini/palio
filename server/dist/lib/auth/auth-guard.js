import { forbidden, unauthorized } from '../http-error.js';
import { SESSION_COOKIE } from './auth-types.js';
import { hasPermissions } from './permissions.js';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function createAuthGuard(sessions, appUrl) {
    const sameOrigin = (req) => {
        const origin = req.get('origin');
        if (origin)
            return origin === appUrl;
        const referer = req.get('referer');
        return !!referer && (referer === appUrl || referer.startsWith(`${appUrl}/`));
    };
    const middleware = (check) => async (req, _res, next) => {
        const request = req;
        if (!SAFE_METHODS.has(request.method) && !sameOrigin(request)) {
            throw forbidden('Origine della richiesta non consentita');
        }
        const token = request.cookies?.[SESSION_COOKIE];
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
        anyUser: () => middleware((user) => {
            if (!user)
                throw unauthorized();
        }),
        require: (...permissions) => {
            if (permissions.length === 0)
                throw new Error('require(): indicare almeno un permesso');
            return middleware((user) => {
                if (!user)
                    throw unauthorized();
                if (!hasPermissions(user, permissions)) {
                    throw forbidden('Non hai il permesso per questa operazione');
                }
            });
        },
    };
}
/** Utente autenticato della richiesta (dopo `anyUser()` o `require()`). */
export function currentUser(req) {
    const user = req.user;
    if (!user)
        throw unauthorized();
    return user;
}
//# sourceMappingURL=auth-guard.js.map