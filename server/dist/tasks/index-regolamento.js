import fs from 'node:fs';
import path from 'node:path';
import { EMBEDDING_MODEL, chunkRegolamentoText, embedText, } from '../lib/regolamento-embeddings.js';
import { extractTextFromPdfFile } from '../lib/regolamento-pdf-text.js';
import { serverRoot } from '../paths.js';
const pdfPath = path.join(serverRoot, 'doc/Regolamento per il Palio.pdf');
const outPath = path.join(serverRoot, 'data/regolamento-index.json');
async function main() {
    if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF non trovato: ${pdfPath}`);
    }
    console.info('[index-regolamento] Lettura PDF…');
    const text = await extractTextFromPdfFile(pdfPath);
    if (!text) {
        throw new Error('Nessun testo estratto dal PDF');
    }
    console.info(`[index-regolamento] Testo estratto: ${text.length} caratteri`);
    const rawChunks = chunkRegolamentoText(text);
    console.info(`[index-regolamento] ${rawChunks.length} chunk da indicizzare…`);
    const chunks = [];
    for (let i = 0; i < rawChunks.length; i += 1) {
        const chunk = rawChunks[i];
        const embedding = (await embedText(chunk.text, 'passage'));
        chunks.push({
            id: `chunk-${i + 1}`,
            text: chunk.text,
            section: chunk.section,
            page: chunk.page,
            embedding,
        });
        if ((i + 1) % 10 === 0 || i + 1 === rawChunks.length) {
            console.info(`[index-regolamento] ${i + 1}/${rawChunks.length}`);
        }
    }
    const index = {
        version: 1,
        model: EMBEDDING_MODEL,
        source: 'server/doc/Regolamento per il Palio.pdf',
        createdAt: new Date().toISOString(),
        chunks,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(index));
    console.info(`[index-regolamento] Scritto ${outPath} (${chunks.length} chunk)`);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=index-regolamento.js.map