// @ts-nocheck
export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
let extractor = null;
let pipelineFn = null;
async function loadPipeline() {
    if (!pipelineFn) {
        const { pipeline } = await import('@xenova/transformers');
        pipelineFn = pipeline;
    }
    return pipelineFn;
}
export async function getExtractor() {
    if (!extractor) {
        const pipeline = await loadPipeline();
        extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
    }
    return extractor;
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
export async function embedText(text, mode = 'passage') {
    const model = await getExtractor();
    const prefix = mode === 'query' ? 'query: ' : 'passage: ';
    const output = await model(prefix + text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}
export function normalizeRegolamentoText(text) {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\u00ad/g, '')
        .replace(/-\n(?=\w)/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
export function chunkRegolamentoText(text, opts = {}) {
    const chunkSize = opts.chunkSize ?? 550;
    const overlap = opts.overlap ?? 80;
    const normalized = normalizeRegolamentoText(text);
    const paragraphs = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const chunks = [];
    let buffer = '';
    let currentSection = null;
    const flush = () => {
        const trimmed = buffer.trim();
        if (!trimmed)
            return;
        chunks.push({
            text: trimmed,
            section: currentSection,
            page: null,
        });
        buffer = trimmed.length > overlap ? trimmed.slice(-overlap) : '';
    };
    for (const para of paragraphs) {
        const sectionMatch = para.match(/^(?:CAPITOLO|Capitolo|Art\.|Articolo)\s+[\w\d.]+/i);
        if (sectionMatch) {
            currentSection = sectionMatch[0];
        }
        if ((buffer + '\n\n' + para).length <= chunkSize) {
            buffer = buffer ? `${buffer}\n\n${para}` : para;
            continue;
        }
        if (buffer)
            flush();
        if (para.length <= chunkSize) {
            buffer = para;
            continue;
        }
        for (let i = 0; i < para.length; i += chunkSize - overlap) {
            const slice = para.slice(i, i + chunkSize).trim();
            if (slice) {
                chunks.push({ text: slice, section: currentSection, page: null });
            }
        }
        buffer = '';
    }
    if (buffer.trim())
        flush();
    return chunks;
}
//# sourceMappingURL=regolamento-embeddings.js.map