import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { serverRoot } from '../paths.js';
import { cosineSimilarity, embedText } from './regolamento-embeddings.js';

export interface RegolamentoChunk {
  id: string;
  text: string;
  section: string | null;
  page: number | null;
  embedding: number[];
}

export interface RegolamentoIndex {
  version: number;
  model: string;
  source: string;
  createdAt: string;
  chunks: RegolamentoChunk[];
}

let cachedIndex: RegolamentoIndex | null = null;

const defaultIndexPath = path.join(serverRoot, 'data/regolamento-index.json');

export function resolveIndexPath() {
  const configured = getConfig().regolamento?.indexPath;
  if (!configured) return defaultIndexPath;
  return path.isAbsolute(configured) ? configured : path.resolve(serverRoot, configured);
}

export function loadIndex(indexPath = resolveIndexPath()): RegolamentoIndex {
  if (cachedIndex && indexPath === resolveIndexPath()) {
    return cachedIndex;
  }
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Indice regolamento non trovato (${indexPath}). Esegui: cd server && npm run index-regolamento`,
    );
  }
  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = JSON.parse(raw) as RegolamentoIndex;
  if (!Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
    throw new Error(`Indice regolamento vuoto o non valido (${indexPath})`);
  }
  if (indexPath === resolveIndexPath()) {
    cachedIndex = parsed;
  }
  return parsed;
}

export function rankChunks(
  chunks: RegolamentoChunk[],
  queryEmbedding: number[],
  opts: { topK?: number; minScore?: number } = {},
) {
  const cfg = getConfig().regolamento;
  const topK = opts.topK ?? cfg?.topK ?? 5;
  const minScore = opts.minScore ?? cfg?.minScore ?? 0.35;

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function formatSearchResults(hits: ReturnType<typeof rankChunks>) {
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

export async function searchRegolamento(
  query: string,
  opts: { topK?: number; minScore?: number; indexPath?: string } = {},
) {
  const trimmed = String(query || '').trim();
  if (!trimmed) {
    throw new Error('Query regolamento vuota');
  }

  const index = loadIndex(opts.indexPath);
  const queryEmbedding = await embedText(trimmed, 'query');
  const hits = rankChunks(index.chunks, queryEmbedding as number[], opts);
  return formatSearchResults(hits);
}

export function resetIndexCache() {
  cachedIndex = null;
}
