import { Abstract_Controller } from './abstract.controller.js';
import { buildGoogleAuthUrl, clearSessionCookie, createSessionToken, exchangeGoogleCode, fetchGoogleUserInfo, hasGoogleOAuthCredentials, maskEmailForDisplay, normalizeEmail, resolveAuthorizedUser, SESSION_COOKIE_NAME, setSessionCookie, } from '../lib/auth/session.js';
import { findDimmeloUserByEmail } from '../lib/dimmelo-users.js';
export class AuthController extends Abstract_Controller {
    constructor(env) {
        super(env, 'api/auth');
        this.router.get('/me', this.getMe.bind(this));
        this.router.get('/logout', this.getLogout.bind(this));
        this.router.get('/google', this.getGoogle.bind(this));
        this.router.get('/google/callback', this.getGoogleCallback.bind(this));
        this.validateAuthConfig();
    }
    validateAuthConfig() {
        const { auth } = this.env.config;
        if (!auth?.enabled)
            return;
        if (!auth.sessionSecret || auth.sessionSecret.length < 32) {
            throw new Error('auth.sessionSecret deve essere impostato (≥32 caratteri) quando auth.enabled è true');
        }
        if (!this.env.pgConnection) {
            throw new Error('config.db è richiesto quando auth.enabled è true (allowlist utenti in dimmelo_users)');
        }
        if (!hasGoogleOAuthCredentials(auth.google)) {
            console.warn('auth.enabled è true ma Google OAuth non è configurato: /api/auth/google risponde 503 finché non imposti clientId e clientSecret in config.mjs o server/config/google-oauth.json');
        }
    }
    async getMe(req, res) {
        const { auth } = this.env.config;
        if (!auth?.enabled) {
            res.send({ email: null, name: null, authEnabled: false });
            return;
        }
        const token = req.cookies?.[SESSION_COOKIE_NAME];
        const user = await resolveAuthorizedUser(this.env.pgConnection, token, auth);
        if (!user) {
            res.status(401).send({ error: 'Non autenticato' });
            return;
        }
        res.send({
            email: user.email,
            name: user.name,
            authEnabled: true,
        });
    }
    async getLogout(_req, res) {
        clearSessionCookie(res);
        res.send({ ok: true });
    }
    async getGoogle(_req, res) {
        const { auth } = this.env.config;
        if (!auth?.enabled) {
            res.status(404).send({ error: 'Auth disabilitata' });
            return;
        }
        if (!hasGoogleOAuthCredentials(auth.google)) {
            res.status(503).send({
                error: 'Google OAuth non configurato. Imposta auth.google in server/config/config.mjs oppure server/config/google-oauth.json',
            });
            return;
        }
        res.redirect(buildGoogleAuthUrl(auth));
    }
    async getGoogleCallback(req, res) {
        const { auth } = this.env.config;
        if (!auth?.enabled) {
            res.status(404).send({ error: 'Auth disabilitata' });
            return;
        }
        if (!hasGoogleOAuthCredentials(auth.google)) {
            res.status(503).send({
                error: 'Google OAuth non configurato. Imposta auth.google in server/config/config.mjs oppure server/config/google-oauth.json',
            });
            return;
        }
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code) {
            const errorUrl = new URL('/login', auth.publicAppUrl);
            errorUrl.searchParams.set('error', 'oauth_failed');
            res.redirect(errorUrl.toString());
            return;
        }
        try {
            const { access_token } = await exchangeGoogleCode(auth, code);
            const userInfo = await fetchGoogleUserInfo(access_token);
            const email = normalizeEmail(userInfo.email);
            const row = await findDimmeloUserByEmail(this.env.pgConnection, email);
            if (!row) {
                const masked = maskEmailForDisplay(email);
                console.warn(`Google login denied: email not in dimmelo_users (${masked || 'missing'})`);
                const deniedUrl = new URL('/login', auth.publicAppUrl);
                deniedUrl.searchParams.set('error', 'access_denied');
                if (masked)
                    deniedUrl.searchParams.set('email', masked);
                res.redirect(deniedUrl.toString());
                return;
            }
            const sessionToken = await createSessionToken({ email: row.email, name: row.display_name }, auth.sessionSecret, auth.sessionTtlSeconds);
            setSessionCookie(res, auth, sessionToken);
            res.redirect(auth.publicAppUrl);
        }
        catch (err) {
            console.error('Google OAuth callback failed', err);
            const errorUrl = new URL('/login', auth.publicAppUrl);
            errorUrl.searchParams.set('error', 'oauth_failed');
            res.redirect(errorUrl.toString());
        }
    }
}
//# sourceMappingURL=auth.controller.js.map