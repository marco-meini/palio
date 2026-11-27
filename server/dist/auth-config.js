/**
 * Configurazione dell'autenticazione (OIDC con ZITADEL, sessioni), dalle variabili d'ambiente.
 * Serve solo all'API: scraper, MCP e task non la caricano.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Variabile d'ambiente mancante: ${name}`);
    }
    return value;
}
function int(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const value = Number.parseInt(raw, 10);
    if (Number.isNaN(value)) {
        throw new Error(`Variabile d'ambiente non numerica: ${name}=${raw}`);
    }
    return value;
}
export function loadAuthConfig() {
    const appUrl = required('APP_URL').replace(/\/+$/, '');
    const cookieSecret = required('COOKIE_SECRET');
    if (cookieSecret.length < 32) {
        throw new Error('COOKIE_SECRET deve essere lungo almeno 32 caratteri');
    }
    const zitadelUrl = required('ZITADEL_URL').replace(/\/+$/, '');
    const url = new URL(zitadelUrl);
    if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
        throw new Error('ZITADEL_URL deve usare https (http è ammesso solo su localhost)');
    }
    return {
        appUrl,
        secureCookies: appUrl.startsWith('https://'),
        cookieSecret,
        zitadel: {
            url: zitadelUrl,
            projectId: required('ZITADEL_PROJECT_ID'),
            token: process.env['ZITADEL_TOKEN'] || undefined,
            organizationId: required('ZITADEL_ORG_ID'),
            loginV2: process.env['ZITADEL_LOGIN_V2'] === 'true',
        },
        oidc: {
            clientId: required('OIDC_CLIENT_ID'),
            clientSecret: required('OIDC_CLIENT_SECRET'),
        },
        mail: loadMailConfig(),
        session: {
            ttlDays: int('SESSION_TTL_DAYS', 30),
            idleDays: int('SESSION_IDLE_DAYS', 7),
        },
    };
}
function loadMailConfig() {
    const host = process.env['SMTP_HOST'];
    if (!host)
        return undefined;
    return {
        host,
        port: int('SMTP_PORT', 587),
        secure: process.env['SMTP_SECURE'] === 'true',
        user: required('SMTP_USER'),
        password: required('SMTP_PASSWORD'),
        from: required('MAIL_FROM'),
    };
}
//# sourceMappingURL=auth-config.js.map