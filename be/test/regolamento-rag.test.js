import assert from 'node:assert/strict';
import test from 'node:test';
import { cosineSimilarity } from '../lib/regolamento-embeddings.mjs';
import {
  formatSearchResults,
  rankChunks,
  resetIndexCache,
} from '../lib/regolamento-rag.mjs';

test('cosineSimilarity — vettori allineati e ortogonali', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test('rankChunks — ordina per similarità e rispetta topK/minScore', () => {
  const chunks = [
    { id: 'a', text: 'canape rincorsa', section: null, page: null, embedding: [1, 0] },
    { id: 'b', text: 'tratta cavalli', section: null, page: null, embedding: [0.9, 0.1] },
    { id: 'c', text: 'altro', section: null, page: null, embedding: [0, 1] },
  ];
  const hits = rankChunks(chunks, [1, 0], { topK: 2, minScore: 0.5 });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].id, 'a');
  assert.equal(hits[1].id, 'b');
  assert.ok(hits[0].score >= hits[1].score);
});

test('formatSearchResults — include metadati e testo', () => {
  const out = formatSearchResults([
    {
      id: 'x',
      text: 'Articolo sulla tratta.',
      section: 'Art. 1',
      page: 3,
      score: 0.812,
      embedding: [],
    },
  ]);
  assert.match(out, /Passaggi dal Regolamento/);
  assert.match(out, /Art\. 1/);
  assert.match(out, /Articolo sulla tratta/);
  assert.match(out, /0\.812/);
});

test('formatSearchResults — nessun hit', () => {
  const out = formatSearchResults([]);
  assert.match(out, /Nessun passaggio rilevante/);
});

test('resetIndexCache — non lancia', () => {
  resetIndexCache();
  assert.doesNotThrow(() => resetIndexCache());
});
