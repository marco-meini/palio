import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCuffiaAssignments,
  compactCuffiaAssignments,
  computeCuffiaPeriods,
  isLongerDrought,
  pickCuffiaContradaId,
} from '../src/lib/contrada-cuffia.js';

test('isLongerDrought — mai vinto batte qualsiasi vittoria', () => {
  assert.equal(isLongerDrought(null, 1), true);
  assert.equal(isLongerDrought(1, null), false);
  assert.equal(isLongerDrought(null, null), false);
  assert.equal(isLongerDrought(1, 3), true);
  assert.equal(isLongerDrought(3, 1), false);
});

test('pickCuffiaContradaId — tie-break su contrada_id', () => {
  const last = new Map<number, number | null>([
    [10, null],
    [3, null],
    [7, 1],
  ]);
  assert.equal(pickCuffiaContradaId([10, 3, 7], last), 3);
});

test('compactCuffiaAssignments — run consecutivi e fine NULL sull’ultimo', () => {
  const periods = compactCuffiaAssignments([
    { palioId: 1, contradaId: 3 },
    { palioId: 2, contradaId: 3 },
    { palioId: 3, contradaId: 5 },
    { palioId: 4, contradaId: 5 },
  ]);
  assert.deepEqual(periods, [
    { contradaId: 3, palioIdInizio: 1, palioIdFine: 2 },
    { contradaId: 5, palioIdInizio: 3, palioIdFine: null },
  ]);
});

test('computeCuffiaPeriods — cambio quando vince la cuffia', () => {
  // Contrade 1,2,3. Ordine edizioni 10,20,30,40.
  // P10 vince 1 → cuffia = min mai vinti = 2
  // P20 vince 3 → last: 1@1, 3@2; cuffia = 2 (ancora mai)
  // P30 vince 2 → last: 1@1, 3@2, 2@3; cuffia = 1 (siccità più lunga)
  // P40 vince 3 → last: 1@1, 2@3, 3@4; cuffia = 1
  const palioIds = [10, 20, 30, 40];
  const wins = new Map([
    [10, 1],
    [20, 3],
    [30, 2],
    [40, 3],
  ]);
  const assignments = buildCuffiaAssignments(palioIds, wins, [1, 2, 3]);
  assert.deepEqual(assignments, [
    { palioId: 10, contradaId: 2 },
    { palioId: 20, contradaId: 2 },
    { palioId: 30, contradaId: 1 },
    { palioId: 40, contradaId: 1 },
  ]);
  assert.deepEqual(computeCuffiaPeriods(palioIds, wins, [1, 2, 3]), [
    { contradaId: 2, palioIdInizio: 10, palioIdFine: 20 },
    { contradaId: 1, palioIdInizio: 30, palioIdFine: null },
  ]);
});

test('buildCuffiaAssignments — palio senza vincitrice riusa stato precedente', () => {
  const palioIds = [1, 2, 3];
  const wins = new Map([[1, 2]]); // solo P1 ha vincitrice
  const assignments = buildCuffiaAssignments(palioIds, wins, [1, 2, 3]);
  // Dopo P1: cuffia = 1 (min tra mai vinti 1 e 3)
  // P2/P3 senza vittoria: stesso lastWin → cuffia resta 1
  assert.deepEqual(assignments, [
    { palioId: 1, contradaId: 1 },
    { palioId: 2, contradaId: 1 },
    { palioId: 3, contradaId: 1 },
  ]);
});

test('compactCuffiaAssignments — lista vuota', () => {
  assert.deepEqual(compactCuffiaAssignments([]), []);
});
