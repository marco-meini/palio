import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { getConfig } from '../../config.js';
const MAX_TITLE_CHARS = 80;
const SYSTEM = `Scrivi il titolo di una conversazione con un assistente che risponde sul Palio di Siena.
Il titolo riassume la domanda dell'utente in 3-7 parole, in italiano.
Rispondi solo con il titolo: niente virgolette, niente punto finale, niente prefissi come "Titolo:".`;
/** Titolo ripulito: una riga, senza virgolette, prefissi o punto finale; `null` se vuoto. */
export function cleanTitle(raw) {
    let title = (raw.split('\n').find((line) => line.trim()) ?? '').trim();
    title = title.replace(/^(titolo|title)\s*:\s*/i, '');
    title = title.replace(/^["'«“*#\s]+|["'»”*\s]+$/g, '');
    title = title.replace(/[.!;:,]+$/, '').replace(/\s+/g, ' ').trim();
    if (!title)
        return null;
    return title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : title;
}
/** Titolo di riserva se l'AI non risponde: l'inizio della domanda. */
export function fallbackTitle(question) {
    return cleanTitle(question.length > 60 ? `${question.slice(0, 60).trimEnd()}…` : question) ?? 'Nuova chat';
}
/** Titolo della conversazione dalla prima domanda, generato con il modello di `ANTHROPIC_TITLE_MODEL`. */
export async function generateChatTitle(question) {
    const config = getConfig();
    if (!config.anthropic.apiKey)
        return fallbackTitle(question);
    try {
        const anthropic = createAnthropic({ apiKey: config.anthropic.apiKey });
        const { text } = await generateText({
            model: anthropic(config.anthropic.titleModel),
            system: SYSTEM,
            prompt: question.slice(0, 2000),
            maxOutputTokens: 200,
            abortSignal: AbortSignal.timeout(20_000),
        });
        return cleanTitle(text) ?? fallbackTitle(question);
    }
    catch (error) {
        console.warn(`[chat] Titolo non generato: ${error.message}`);
        return fallbackTitle(question);
    }
}
//# sourceMappingURL=chat-title.js.map