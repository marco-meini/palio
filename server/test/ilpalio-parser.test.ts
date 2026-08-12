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
  parsePittoreDrappellone,
  parseProve,
  parseRivalita,
  parseRivalitaYearText,
} from '../src/lib/ilpalio-parser.js';
import * as cheerio from 'cheerio';

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

test('parseProve — Palio 202607020 ingresso canape', () => {
  const prove = parseProve(fixture('prove-202607020.html'));
  assert.equal(prove.length, 6);
  assert.equal(prove[0].numero, 1);
  assert.equal(prove[0].etichetta, 'Prima prova');
  assert.equal(prove[4].etichetta, 'Prova Generale');
  assert.equal(prove[5].etichetta, 'Provaccia');

  const p1onda = prove[0].rows.find((r) => r.contradaCode === normalizeContradaCode('ON'));
  assert.ok(p1onda);
  assert.equal(p1onda.canape, 1);
  assert.equal(p1onda.nonPartecipa, false);
  assert.equal(p1onda.fantino?.sourceId, '940');
  assert.equal(p1onda.fantino?.label, 'Brigante');

  const p2civ = prove[1].rows.find((r) => r.contradaCode === normalizeContradaCode('CI'));
  assert.ok(p2civ);
  assert.equal(p2civ.fantino?.sourceId, '1089');
  assert.match(p2civ.fantino?.label || '', /Giovanni Puddu/);

  assert.equal(prove[5].rows.length, 10);
  assert.ok(prove[5].rows.every((r) => r.nonPartecipa && r.canape == null && r.fantino == null));
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

test('parsePittoreDrappellone — da #spAutoreDrappellone', () => {
  const $cadute = cheerio.load(fixture('cadute-202607020.html'));
  assert.equal(parsePittoreDrappellone($cadute), 'Ismaele Nones');

  const $arrivo = cheerio.load(fixture('ordine-arrivo-202507020.html'));
  assert.equal(parsePittoreDrappellone($arrivo), 'Riccardo Manganelli');

  assert.equal(parsePittoreDrappellone(cheerio.load('<div></div>')), null);
  assert.equal(
    parsePittoreDrappellone(
      cheerio.load('<span id="spAutoreDrappellone">di Solo Testo</span>'),
    ),
    'Solo Testo',
  );
});
