/** Cookie di sessione (id casuale; in DB solo il suo hash). */
export const SESSION_COOKIE = 'palio_sid';
/** Cookie temporaneo con il login OIDC in corso (state, nonce, PKCE), firmato HMAC. */
export const LOGIN_COOKIE = 'palio_login';
/** Path del cookie di login: serve solo a /api/auth/callback. */
export const LOGIN_COOKIE_PATH = '/api/auth';
//# sourceMappingURL=auth-types.js.map