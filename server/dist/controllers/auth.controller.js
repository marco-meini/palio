import { Abstract_Controller } from './abstract.controller.js';
import { currentUser } from '../lib/auth/auth-guard.js';
import { toCurrentUserDto } from '../lib/auth/auth-mapper.js';
import { LOGIN_COOKIE, LOGIN_COOKIE_PATH, SESSION_COOKIE } from '../lib/auth/auth-types.js';
import { decodeLoginState, encodeLoginState, LOGIN_STATE_TTL_MS } from '../lib/auth/login-state.js';
import { LoginRejectedError } from '../lib/auth/oidc-client.js';
import { HttpError } from '../lib/http-error.js';
/**
 * Accesso con OIDC (pagina di login di ZITADEL), uscita e utente corrente. Montato su
 * `/api/auth`. `/login` e `/callback` sono navigazioni del browser (redirect), non chiamate XHR.
 */
export class AuthController extends Abstract_Controller {
    constructor(env) {
        super(env, 'auth');
        const { guard } = env.auth;
        this.router.get('/login', guard.public(), this.login.bind(this));
        this.router.get('/callback', guard.public(), this.callback.bind(this));
        this.router.post('/logout', guard.public(), this.logout.bind(this));
        this.router.get('/me', guard.anyUser(), this.me.bind(this));
    }
    /**
     * Va alla pagina di login di ZITADEL (`?account=altro`: scelta dell'account); lo stato del
     * tentativo resta in un cookie firmato.
     */
    async login(req, res) {
        const { auth, config } = this.env.auth;
        let target;
        try {
            target = await auth.startLogin(req.query['returnTo'], req.query['account'] === 'altro');
        }
        catch {
            return this.loginError(res, 'servizio');
        }
        res.cookie(LOGIN_COOKIE, encodeLoginState(target.state, config.cookieSecret), {
            httpOnly: true,
            secure: config.secureCookies,
            // lax: il ritorno da ZITADEL è una navigazione da un altro sito
            sameSite: 'lax',
            path: LOGIN_COOKIE_PATH,
            maxAge: LOGIN_STATE_TTL_MS,
        });
        res.redirect(target.url);
    }
    /** Ritorno da ZITADEL: apre la sessione di palio e torna dove l'utente voleva andare. */
    async callback(req, res) {
        const { auth, config, sessions } = this.env.auth;
        const raw = req.cookies?.[LOGIN_COOKIE];
        res.clearCookie(LOGIN_COOKIE, { path: LOGIN_COOKIE_PATH });
        const state = raw ? decodeLoginState(raw, config.cookieSecret) : null;
        if (!state)
            return this.loginError(res, 'scaduto');
        const query = req.originalUrl.split('?')[1] ?? '';
        try {
            const { session, returnTo } = await auth.finishLogin(query, state, req.get('user-agent') ?? null);
            res.cookie(SESSION_COOKIE, session.token, sessions.cookieOptions(session.expiresAt));
            res.redirect(returnTo);
        }
        catch (error) {
            if (error instanceof LoginRejectedError)
                return this.loginError(res, 'annullato');
            if (error instanceof HttpError && error.status === 403)
                return this.loginError(res, 'negato');
            console.error(`[auth] Login non riuscito: ${error.message}`);
            return this.loginError(res, 'servizio');
        }
    }
    /** Chiude la sessione; il client manda poi il browser su `logoutUrl` (uscita da ZITADEL). */
    async logout(req, res) {
        const { auth, sessions } = this.env.auth;
        const logoutUrl = await auth.logout(req.cookies?.[SESSION_COOKIE]);
        res.clearCookie(SESSION_COOKIE, sessions.cookieOptions());
        res.send({ logoutUrl });
    }
    /** Utente corrente con i suoi permessi effettivi (401 se non autenticato). */
    me(req, res) {
        res.send(toCurrentUserDto(currentUser(req)));
    }
    loginError(res, code) {
        res.redirect(`/accesso?errore=${code}`);
    }
}
//# sourceMappingURL=auth.controller.js.map