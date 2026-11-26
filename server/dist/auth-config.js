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
            organizationId: process.env['ZITADEL_ORG_ID'] || undefined,
        },
        oidc: {
            clientId: required('OIDC_CLIENT_ID'),
            clientSecret: required('OIDC_CLIENT_SECRET'),
        },
        session: {
            ttlDays: int('SESSION_TTL_DAYS', 30),
            idleDays: int('SESSION_IDLE_DAYS', 7),
        },
    };
}
//# sourceMappingURL=auth-config.js.map