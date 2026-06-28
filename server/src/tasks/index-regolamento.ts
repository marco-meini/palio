import fs from 'node:fs';
import path from 'node:path';
import { initConfig } from '../config.js';
import { resolveApiPgConfig } from '../lib/db-config.js';
import {
  EMBEDDING_MODEL,
  chunkRegolamentoText,
  embedText,
} from '../lib/regolamento-embeddings.js';
import { extractTextFromPdfFile } from '../lib/regolamento-pdf-text.js';
import { PgClientManager } from '../lib/pg-client-manager.js';
import {
  countRegolamentoChunks,
  replaceRegolamentoChunks,
} from '../lib/regolamento-store.js';
import { serverRoot } from '../paths.js';

const pdfPath = path.join(serverRoot, 'doc/Regolamento per il Palio.pdf');

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

  const chunks: Array<{
    id: string;
    text: string;
    section: string | null;
    page: number | null;
    embedding: number[];
  }> = [];

  for (let i = 0; i < rawChunks.length; i += 1) {
    const chunk = rawChunks[i];
    const embedding = (await embedText(chunk.text, 'passage')) as number[];
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

  await initConfig();
  const pg = new PgClientManager(resolveApiPgConfig() as import('pg').PoolConfig);
  try {
    const written = await replaceRegolamentoChunks(pg, {
      source: pdfPath,
      model: EMBEDDING_MODEL,
      chunks,
    });
    const total = await countRegolamentoChunks(pg, pdfPath);
    console.info(`[index-regolamento] DB: ${written} chunk scritti (${total} totali per source)`);
  } finally {
    await pg.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
