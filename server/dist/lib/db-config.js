function requireDatabaseUrl(name, value) {
    if (!value?.trim()) {
        throw new Error(`${name} non impostato. Copia .env.example in .env (dev) o .env.production (prod) e compila DATABASE_URL.`);
    }
    return { connectionString: value.trim() };
}
/** Pool applicativo (API, scraper, auth, RAG). */
export function resolveApiPgConfig() {
    return requireDatabaseUrl('DATABASE_URL', process.env.DATABASE_URL);
}
/** Pool read-only chat / MCP. Fallback su DATABASE_URL se CHAT_DATABASE_URL assente. */
export function resolveChatPgConfig() {
    const chatUrl = process.env.CHAT_DATABASE_URL?.trim();
    if (chatUrl) {
        return { connectionString: chatUrl };
    }
    const apiUrl = process.env.DATABASE_URL?.trim();
    if (apiUrl) {
        console.warn('[chat-db] CHAT_DATABASE_URL non impostato — uso DATABASE_URL. ' +
            'In produzione imposta un utente read-only (palio_chat_ro).');
        return { connectionString: apiUrl };
    }
    throw new Error('CHAT_DATABASE_URL o DATABASE_URL richiesto. Vedi .env.example nella root del repo.');
}
/** Alias usato da task legacy; equivale a resolveApiPgConfig. */
export function loadPgConfig() {
    return resolveApiPgConfig();
}
//# sourceMappingURL=db-config.js.map