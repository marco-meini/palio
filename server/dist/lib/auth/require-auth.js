import { resolveAuthorizedUser, SESSION_COOKIE_NAME } from './session.js';
export function createRequireAuth(env) {
    const { auth } = env.config;
    const pg = env.pgConnection;
    return async function requireAuth(req, res, next) {
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
        req.user = user;
        next();
    };
}
//# sourceMappingURL=require-auth.js.map