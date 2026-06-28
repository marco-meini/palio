import { getConfig } from '../config.js';
import { cosineSimilarity, embedText } from './regolamento-embeddings.js';
import { searchRegolamentoChunks } from './regolamento-store.js';
/** Usato nei test; la ricerca runtime passa da pgvector. */
export function rankChunks(chunks, queryEmbedding, opts = {}) {
    const cfg = getConfig().regolamento;
    const topK = opts.topK ?? cfg?.topK ?? 5;
    const minScore = opts.minScore ?? cfg?.minScore ?? 0.35;
    return chunks
        .map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        section: chunk.section,
        page: chunk.page,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
        .filter((item) => item.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
export function formatSearchResults(hits) {
    if (hits.length === 0) {
        return 'Nessun passaggio rilevante trovato nel Regolamento per questa query.';
    }
    const lines = hits.map((hit, i) => {
        const meta = [
            hit.section ? `sezione: ${hit.section}` : null,
            hit.page != null ? `pagina: ${hit.page}` : null,
            `score: ${hit.score.toFixed(3)}`,
        ]
            .filter(Boolean)
            .join(', ');
        return `[${i + 1}] (${meta})\n${hit.text}`;
    });
    return `Passaggi dal Regolamento (${hits.length}):\n\n${lines.join('\n\n')}`;
}
export async function searchRegolamento(query, opts = {}, pg) {
    const trimmed = String(query || '').trim();
    if (!trimmed) {
        throw new Error('Query regolamento vuota');
    }
    if (!pg) {
        throw new Error('Connessione Postgres non disponibile per search_regolamento. ' +
            'Avvia l\'API con DATABASE_URL o config.db.');
    }
    const cfg = getConfig().regolamento;
    const queryEmbedding = (await embedText(trimmed, 'query'));
    const hits = await searchRegolamentoChunks(pg, queryEmbedding, {
        topK: opts.topK ?? cfg?.topK ?? 5,
        minScore: opts.minScore ?? cfg?.minScore ?? 0.35,
    });
    return formatSearchResults(hits);
}
//# sourceMappingURL=regolamento-rag.js.map