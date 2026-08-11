import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  normalizeContradaCode,
  parseAssegnazioneCavalli,
  parseCadute,
  parseDirigenze,
  parseOrdineArrivo,
  parseRivalita,
  parseRivalitaYearText,
} from '../src/lib/ilpalio-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

test('parseRivalitaYearText — pattern dal / fino / poi', () => {
  assert.deepEqual(parseRivalitaYearText('(dal 1947)'), [
    { dataInizio: '1947-01-01', dataFine: null },
  ]);
  assert.deepEqual(parseRivalitaYearText('(dal 1730 al 1947)'), [
    { dataInizio: '1730-01-01', dataFine: '1947-12-31' },
  ]);
  assert.deepEqual(parseRivalitaYearText('(fino al 1786, poi dal 1952)'), [
    { dataInizio: null, dataFine: '1786-12-31' },
    { dataInizio: '1952-01-01', dataFine: null },
  ]);
});

test('parseRivalita — Aquila vs Pantera dal 1947', () => {
  const rows = parseRivalita(fixture('rivalita-aquila.html'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rivaleCode, 'PA');
  assert.equal(rows[0].dataInizio, '1947-01-01');
  assert.equal(rows[0].dataFine, null);
});

test('parseRivalita — Nicchio vs Valdimontone due periodi', () => {
  const rows = parseRivalita(fixture('rivalita-nicchio.html'));
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.rivaleCode === 'VA'));
  assert.deepEqual(
    rows.map((r) => ({ dataInizio: r.dataInizio, dataFine: r.dataFine })),
    [
      { dataInizio: null, dataFine: '1786-12-31' },
      { dataInizio: '1952-01-01', dataFine: null },
    ],
  );
});

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

test('parseCadute — Palio 202607020', () => {
  const map = parseCadute(fixture('cadute-202607020.html'));

  assert.equal(map.size, 4);
  assert.equal(map.get(normalizeContradaCode('TO')), 1);
  assert.equal(map.get(normalizeContradaCode('GI')), 1);
  assert.equal(map.get(normalizeContradaCode('BR')), 2);
  assert.equal(map.get(normalizeContradaCode('DR')), 2);
  assert.equal(map.get(normalizeContradaCode('OC')), undefined);
});

test('parseAssegnazioneCavalli — Palio 202607030 senza PresoDa', () => {
  const map = parseAssegnazioneCavalli(fixture('assegnazione-cavalli-202607030.html'));
  assert.equal(map.size, 10);

  const bruco = map.get(normalizeContradaCode('BR'));
  assert.ok(bruco);
  assert.equal(bruco.ordineAssegnazione, 1);
  assert.equal(bruco.orecchio, 6);
  assert.equal(bruco.coscia, 15);
  assert.equal(bruco.proprietarioCavallo, 'Michele Seazzu');
  assert.equal(bruco.cavalloPresoDa, null);

  const giraffa = map.get(normalizeContradaCode('GI'));
  assert.ok(giraffa);
  assert.equal(giraffa.ordineAssegnazione, 10);
  assert.equal(giraffa.proprietarioCavallo, 'Luciano Marri');
  assert.equal(giraffa.cavalloPresoDa, null);
});
