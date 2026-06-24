import { SignJWT, jwtVerify } from 'jose';
import { findDimmeloUserByEmail, normalizeEmail } from '../dimmelo-users.js';
export { normalizeEmail };
export const SESSION_COOKIE_NAME = 'palio_session';
export function maskEmailForDisplay(email) {
    const normalized = normalizeEmail(email);
    const at = normalized.indexOf('@');
    if (at < 1)
        return '';
    return `${normalized.slice(0, at)}@***`;
}
export async function createSessionToken(user, secret, ttlSeconds) {
    const email = normalizeEmail(user.email);
    const key = new TextEncoder().encode(secret);
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
        email,
        name: user.name ?? email,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(email)
        .setIssuedAt(now)
        .setExpirationTime(now + ttlSeconds)
        .sign(key);
}
export async function verifySessionToken(token, secret) {
    if (!token)
        return null;
    try {
        const key = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        const email = normalizeEmail(typeof payload.email === 'string' ? payload.email : String(payload.sub ?? ''));
        if (!email)
            return null;
        const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email;
        return { email, name };
    }
    catch {
        return null;
    }
}
export async function resolveAuthorizedUser(pg, token, auth) {
    const session = await verifySessionToken(token ?? '', auth.sessionSecret);
    if (!session || !pg)
        return null;
    const row = await findDimmeloUserByEmail(pg, session.email);
    if (!row)
        return null;
    return { email: row.email, name: row.display_name };
}
export function setSessionCookie(res, auth, token) {
    res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: auth.sessionTtlSeconds * 1000,
    });
}
export function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });
}
export async function fetchGoogleUserInfo(accessToken) {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        throw new Error(`Google userinfo failed (${response.status})`);
    }
    return (await response.json());
}
export function hasGoogleOAuthCredentials(google) {
    const clientId = String(google?.clientId ?? '').trim();
    const clientSecret = String(google?.clientSecret ?? '').trim();
    if (!clientId || !clientSecret)
        return false;
    if (/^REPLACE_/i.test(clientId) || /^REPLACE_/i.test(clientSecret))
        return false;
    return true;
}
export function buildGoogleAuthUrl(auth) {
    const redirectUri = `${auth.publicApiUrl.replace(/\/$/, '')}/api/auth/google/callback`;
    const params = new URLSearchParams({
        client_id: auth.google.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
export async function exchangeGoogleCode(auth, code) {
    const redirectUri = `${auth.publicApiUrl.replace(/\/$/, '')}/api/auth/google/callback`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: auth.google.clientId,
            client_secret: auth.google.clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Google token exchange failed (${response.status}): ${body}`);
    }
    return (await response.json());
}
//# sourceMappingURL=session.js.map