import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMBEDDING_MODEL,
  chunkRegolamentoText,
  embedText,
} from '../lib/regolamento-embeddings.mjs';
import { extractTextFromPdfFile } from '../lib/regolamento-pdf-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const pdfPath = path.join(projectRoot, 'be/doc/Regolamento per il Palio.pdf');
const outPath = path.join(projectRoot, 'be/data/regolamento-index.json');

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

  /** @type {Array<{ id: string; text: string; section: string | null; page: number | null; embedding: number[] }>} */
  const chunks = [];
  for (let i = 0; i < rawChunks.length; i += 1) {
    const chunk = rawChunks[i];
    const embedding = await embedText(chunk.text, 'passage');
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
    source: 'be/doc/Regolamento per il Palio.pdf',
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
