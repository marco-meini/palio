// @ts-nocheck
const DEFAULT_USER_AGENT = 'palio-importer/1.0 (https://github.com/palio; contact: local dev)';
export async function fetchHtml(url, { delayMs = 0 } = {}) {
    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const res = await fetch(url, {
        headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return res.text();
}
export function resolvePalioUrl(href, baseUrl = 'https://www.ilpalio.siena.it') {
    if (!href)
        return null;
    if (href.startsWith('http://') || href.startsWith('https://')) {
        return href;
    }
    const base = baseUrl.replace(/\/$/, '');
    const path = href.startsWith('/') ? href : `/${href}`;
    return `${base}${path}`;
}
export function sourceCodeFromUrl(url) {
    const match = String(url).match(/\/Palio\/(\d{9})(?:\/|$)/i);
    return match ? match[1] : null;
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class HttpsRequests {
    static async call(url, options = {}) {
        const method = options.method ?? 'GET';
        const res = await fetch(url, {
            method,
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} fetching ${url}`);
        }
        const body = await res.text();
        return { body, status: res.status };
    }
}
//# sourceMappingURL=https-requests.js.map