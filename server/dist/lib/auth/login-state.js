import { createHmac, timingSafeEqual } from 'node:crypto';
export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
// Prefisso di dominio: una firma valida per altri usi non vale qui.
function sign(payload, secret) {
    return createHmac('sha256', secret).update(`login.${payload}`).digest('base64url');
}
/** Serializza e firma lo stato: `<payload base64url>.<hmac>`. */
export function encodeLoginState(state, secret) {
    const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
    return `${payload}.${sign(payload, secret)}`;
}
/** Verifica firma e scadenza; `null` se il valore è manomesso, malformato o scaduto. */
export function decodeLoginState(value, secret, now = Date.now()) {
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra !== undefined)
        return null;
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
        return null;
    try {
        const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        for (const key of ['state', 'nonce', 'codeVerifier', 'returnTo']) {
            if (typeof state[key] !== 'string')
                return null;
        }
        if (typeof state.expiresAt !== 'number' || state.expiresAt < now)
            return null;
        return state;
    }
    catch {
        return null;
    }
}
/** Solo path interni (anti open-redirect): altrimenti la home. */
export function safeReturnTo(value) {
    return typeof value === 'string' &&
        value.startsWith('/') &&
        !value.startsWith('//') &&
        !value.startsWith('/\\') &&
        value.length <= 500
        ? value
        : '/';
}
//# sourceMappingURL=login-state.js.map