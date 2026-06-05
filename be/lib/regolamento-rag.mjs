import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config/load-config.mjs';
import {
  cosineSimilarity,
  embedText,
} from './regolamento-embeddings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BE_ROOT = path.resolve(__dirname, '..');
const defaultIndexPath = path.join(BE_ROOT, 'data/regolamento-index.json');

/**
 * @typedef {{ id: string; text: string; section: string | null; page: number | null; embedding: number[] }} RegolamentoChunk
 * @typedef {{ version: number; model: string; source: string; createdAt: string; chunks: RegolamentoChunk[] }} RegolamentoIndex
 */

/** @type {RegolamentoIndex | null} */
let cachedIndex = null;

/**
 * @returns {string}
 */
export function resolveIndexPath() {
  const configured = config.regolamento?.indexPath;
  if (!configured) return defaultIndexPath;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(BE_ROOT, configured);
}

/**
 * @param {string} [indexPath]
 * @returns {RegolamentoIndex}
 */
export function loadIndex(indexPath = resolveIndexPath()) {
  if (cachedIndex && indexPath === resolveIndexPath()) {
    return cachedIndex;
  }
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Indice regolamento non trovato (${indexPath}). Esegui: cd be && npm run index-regolamento`,
    );
  }
  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = /** @type {RegolamentoIndex} */ (JSON.parse(raw));
  if (!Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
    throw new Error(`Indice regolamento vuoto o non valido (${indexPath})`);
  }
  if (indexPath === resolveIndexPath()) {
    cachedIndex = parsed;
  }
  return parsed;
}

/**
 * @param {RegolamentoChunk[]} chunks
 * @param {number[]} queryEmbedding
 * @param {{ topK?: number; minScore?: number }} [opts]
 */
export function rankChunks(chunks, queryEmbedding, opts = {}) {
  const topK = opts.topK ?? config.regolamento?.topK ?? 5;
  const minScore = opts.minScore ?? config.regolamento?.minScore ?? 0.35;

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * @param {ReturnType<typeof rankChunks>} hits
 * @returns {string}
 */
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

/**
 * @param {string} query
 * @param {{ topK?: number; minScore?: number; indexPath?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function searchRegolamento(query, opts = {}) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    throw new Error('Query regolamento vuota');
  }

  const index = loadIndex(opts.indexPath);
  const queryEmbedding = await embedText(trimmed, 'query');
  const hits = rankChunks(index.chunks, queryEmbedding, opts);
  return formatSearchResults(hits);
}

/**
 * Solo per test: resetta la cache in memoria.
 */
export function resetIndexCache() {
  cachedIndex = null;
}
