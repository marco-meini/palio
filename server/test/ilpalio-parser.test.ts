import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  normalizeContradaCode,
  parseDirigenze,
  parseOrdineArrivo,
} from '../src/lib/ilpalio-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

test('parseDirigenze — Palio 202507020', () => {
  const html = fixture('dirigenze-202507020.html');
  const map = parseDirigenze(html);

  assert.equal(map.size, 10);

  const tartuca = map.get(normalizeContradaCode('TA'));
  assert.ok(tartuca);
  assert.equal(tartuca.capitano, 'Niccolò Rugani');
  assert.equal(tartuca.priore, 'Simone Ciotti');
  assert.equal(tartuca.barbaresco, 'Riccardo Salvini');
  assert.deepEqual(tartuca.mangini, [
    'Leonardo Landozzi',
    'Alessandro Sasso',
    'Luca Sprugnoli',
    'Dario Zanda',
  ]);

  const oca = map.get(normalizeContradaCode('OC'));
  assert.ok(oca);
  assert.equal(oca.capitano, 'Duccio Cottini');
  assert.equal(oca.priore, 'Claudio Laini');
  assert.equal(oca.mangini.length, 4);

  const bruco = map.get(normalizeContradaCode('BR'));
  assert.ok(bruco);
  assert.equal(bruco.priore, 'Alessandro Benvenuti');
});

test('parseOrdineArrivo — Palio 202507020', () => {
  const html = fixture('ordine-arrivo-202507020.html');
  const map = parseOrdineArrivo(html);

  assert.equal(map.size, 4);
  assert.equal(map.get(normalizeContradaCode('OC')), 1);
  assert.equal(map.get(normalizeContradaCode('BR')), 2);
  assert.equal(map.get(normalizeContradaCode('SE')), 3);
  assert.equal(map.get(normalizeContradaCode('VA')), 4);
});
