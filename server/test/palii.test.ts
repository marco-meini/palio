import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePaliiFilters } from '../src/controllers/palii.controller.js';
import type { Db } from '../src/lib/db.js';
import { HttpError } from '../src/lib/http-error.js';
import { PaliiService, palioName } from '../src/lib/palii/palii-service.js';
import {
  escapeLike,
  ModelPaliiArchive,
  type PalioNavRow,
  type PartecipazioneRow,
} from '../src/model/palii-archive.model.js';

const isBadRequest = (e: unknown) => e instanceof HttpError && e.status === 400;

describe('Palii: filtri dalla query string', () => {
  it('vuota: prima pagina, nessun filtro', () => {
    assert.deepEqual(parsePaliiFilters({}), {
      yearFrom: undefined,
      yearTo: undefined,
      winnerId: undefined,
      kind: undefined,
      q: undefined,
      page: 1,
    });
  });

  it('tutti i filtri', () => {
    assert.deepEqual(
      parsePaliiFilters({ annoDa: '1950', annoA: '2000', vincitrice: '3', tipo: 'straordinari', q: '  Aceto ', pagina: '2' }),
      { yearFrom: 1950, yearTo: 2000, winnerId: 3, kind: 'straordinari', q: 'Aceto', page: 2 },
    );
  });

  it('valori non validi → 400', () => {
    assert.throws(() => parsePaliiFilters({ annoDa: 'abc' }), isBadRequest);
    assert.throws(() => parsePaliiFilters({ tipo: 'tutti' }), isBadRequest);
    assert.throws(() => parsePaliiFilters({ vincitrice: '-1' }), isBadRequest);
    assert.throws(() => parsePaliiFilters({ pagina: '0' }), isBadRequest);
    assert.throws(() => parsePaliiFilters({ q: ['a', 'b'] }), isBadRequest);
    assert.throws(() => parsePaliiFilters({ q: 'x'.repeat(101) }), isBadRequest);
  });
});

describe('Palii: nome e ricerca', () => {
  it('nome dalla data', () => {
    assert.equal(palioName('2024-07-02', false), 'Palio di Provenzano');
    assert.equal(palioName('2024-08-16', false), "Palio dell'Assunta");
    assert.equal(palioName('2018-10-20', true), 'Palio straordinario');
  });

  it('il testo cercato non contiene caratteri jolly', () => {
    assert.equal(escapeLike('50%_a\\b'), '50\\%\\_a\\\\b');
  });

  it('elenco: parametri della query (tipo, testo, pagina)', async () => {
    const calls: unknown[][] = [];
    const db = {
      query: async (_sql: string, params: unknown[]) => {
        calls.push(params);
        return [];
      },
    } as unknown as Db;
    const model = new ModelPaliiArchive(db);
    await model.list({ kind: 'ordinari', q: 'Tit_', page: 1 }, 50, 0);
    assert.deepEqual(calls[0], [null, null, null, false, '%Tit\\_%', 50, 0]);
  });
});

describe('Palii: scheda', () => {
  const palio: PalioNavRow = {
    id: 10,
    data: '1990-08-16',
    straordinario: false,
    pittore_drappellone: 'Un pittore',
    vincitrice: 'Onda',
    fantino_nome: 'Mario Rossi',
    fantino_soprannome: 'Il Rosso',
    cavallo: 'Baio',
    previous_id: 9,
    next_id: null,
  };
  const partecipazione = (over: Partial<PartecipazioneRow>): PartecipazioneRow => ({
    contrada: 'Onda',
    vincitrice: false,
    non_partecipa: false,
    canape: null,
    ordine: null,
    estratta: false,
    estratta_da: null,
    ordine_assegnazione: null,
    orecchio: null,
    coscia: null,
    cavallo: null,
    proprietario_cavallo: null,
    cavallo_preso_da: null,
    fantino_nome: null,
    fantino_soprannome: null,
    ordine_arrivo: null,
    giro_caduta: null,
    capitano: null,
    priore: null,
    barbaresco: null,
    mangini: [],
    ...over,
  });

  const model = {
    get: async (id: number) => (id === 10 ? palio : null),
    partecipazioni: async () => [
      partecipazione({ contrada: 'Onda', vincitrice: true, canape: 3, fantino_nome: 'Mario Rossi', mangini: ['A', 'B'] }),
      partecipazione({ contrada: 'Torre', canape: 10 }),
    ],
    prove: async () => [
      { numero: 5, contrada: 'Onda', canape: 2, non_partecipa: false, fantino_nome: 'Mario Rossi', fantino_soprannome: null },
      { numero: 1, contrada: 'Onda', canape: 4, non_partecipa: false, fantino_nome: null, fantino_soprannome: null },
      { numero: 1, contrada: 'Torre', canape: null, non_partecipa: true, fantino_nome: null, fantino_soprannome: null },
    ],
  } as unknown as ModelPaliiArchive;
  const service = new PaliiService(model);

  it('dati del Palio, contrade e prove raggruppate in ordine', async () => {
    const detail = await service.get(10);
    assert.equal(detail.name, "Palio dell'Assunta");
    assert.deepEqual(detail.winner, {
      contrada: 'Onda',
      fantino: { nome: 'Mario Rossi', soprannome: 'Il Rosso' },
      cavallo: 'Baio',
    });
    assert.equal(detail.previousId, 9);
    assert.equal(detail.nextId, null);
    assert.deepEqual(detail.contrade[0]?.mangini, ['A', 'B']);
    assert.equal(detail.contrade[1]?.fantino, null);
    assert.deepEqual(
      detail.prove.map((p) => [p.numero, p.name, p.entries.length]),
      [
        [1, 'Prima prova', 2],
        [5, 'Prova generale', 1],
      ],
    );
  });

  it('Palio inesistente → 404', async () => {
    await assert.rejects(service.get(99), (e: unknown) => e instanceof HttpError && e.status === 404);
  });
});
