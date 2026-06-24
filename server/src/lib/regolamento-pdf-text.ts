// @ts-nocheck
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { createWorker } from 'tesseract.js';
import { normalizeRegolamentoText } from './regolamento-embeddings.js';

function resolvePdftoppm() {
  const candidates = [
    process.env.PDFTOPPM_PATH,
    '/opt/homebrew/opt/poppler/bin/pdftoppm',
    '/usr/local/opt/poppler/bin/pdftoppm',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  try {
    const found = execFileSync('which', ['pdftoppm'], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {
    // ignore
  }

  return null;
}

async function ocrPdfWithPdftoppm(pdfPath) {
  const pdftoppm = resolvePdftoppm();
  if (!pdftoppm) {
    throw new Error(
      'pdftoppm non trovato (necessario per PDF scansionati). Installa poppler: brew install poppler',
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'palio-regolamento-'));
  const prefix = path.join(tmpDir, 'page');

  try {
    execFileSync(
      pdftoppm,
      ['-png', '-r', '200', pdfPath, prefix],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const imagePaths = fs
      .readdirSync(tmpDir)
      .filter((name) => name.endsWith('.png'))
      .sort()
      .map((name) => path.join(tmpDir, name));

    const worker = await createWorker('ita');
    const parts = [];

    try {
      for (let i = 0; i < imagePaths.length; i += 1) {
        const { data } = await worker.recognize(imagePaths[i]);
        const text = normalizeRegolamentoText(data.text || '');
        if (text) parts.push(text);
        console.info(`[index-regolamento] OCR pagina ${i + 1}/${imagePaths.length}`);
      }
    } finally {
      await worker.terminate();
    }

    const ocrText = parts.join('\n\n');
    if (!ocrText) {
      throw new Error('OCR non ha prodotto testo dal PDF');
    }
    return ocrText;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('pdftoppm')) throw err;
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '';
    throw new Error(`pdftoppm/OCR fallito${stderr ? `: ${stderr.trim()}` : ''}`);
  } finally {
    for (const file of fs.readdirSync(tmpDir)) {
      fs.unlinkSync(path.join(tmpDir, file));
    }
    fs.rmdirSync(tmpDir);
  }
}

export async function extractTextFromPdfFile(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const parsed = await pdf(buffer);
  const direct = normalizeRegolamentoText(parsed.text || '');
  if (direct.length >= 500) {
    return direct;
  }

  console.info(
    `[index-regolamento] Testo PDF scarso (${direct.length} caratteri, ${parsed.numpages} pagine) — OCR in corso…`,
  );
  return ocrPdfWithPdftoppm(pdfPath);
}
