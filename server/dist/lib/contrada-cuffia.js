/**
 * Cuffia / nonna: periodi derivati da palio_partecipazioni.vincitrice.
 * Semantica: dopo il risultato di ogni Palio (vittorie con edizione ≤ P).
 */
/** True se la siccità di `a` è più lunga di quella di `b` (last-win seq; null = mai vinto). */
export function isLongerDrought(lastWinSeqA, lastWinSeqB) {
    if (lastWinSeqA === null && lastWinSeqB === null)
        return false;
    if (lastWinSeqA === null)
        return true;
    if (lastWinSeqB === null)
        return false;
    return lastWinSeqA < lastWinSeqB;
}
/**
 * Sceglie la cuffia: siccità massima; tie-break `contrada_id` crescente.
 * `lastWinSeqByContrada`: seq 1-based dell’ultima vittoria, o null se mai vinto.
 */
export function pickCuffiaContradaId(contradaIds, lastWinSeqByContrada) {
    if (contradaIds.length === 0) {
        throw new Error('pickCuffiaContradaId: lista contrade vuota');
    }
    let bestId = contradaIds[0];
    let bestSeq = lastWinSeqByContrada.get(bestId) ?? null;
    for (let i = 1; i < contradaIds.length; i++) {
        const id = contradaIds[i];
        const seq = lastWinSeqByContrada.get(id) ?? null;
        if (isLongerDrought(seq, bestSeq) || (seq === bestSeq && id < bestId)) {
            bestId = id;
            bestSeq = seq;
        }
    }
    return bestId;
}
/**
 * Per ogni edizione in ordine cronologico, assegna la cuffia dopo il risultato.
 * `winsByPalioId`: vincitrice di quell’edizione (assente = nessuna vittoria registrata).
 */
export function buildCuffiaAssignments(palioIdsChronological, winsByPalioId, contradaIds) {
    const lastWinSeq = new Map();
    for (const id of contradaIds) {
        lastWinSeq.set(id, null);
    }
    const assignments = [];
    for (let i = 0; i < palioIdsChronological.length; i++) {
        const palioId = palioIdsChronological[i];
        const seq = i + 1;
        const winnerId = winsByPalioId.get(palioId);
        if (winnerId != null) {
            lastWinSeq.set(winnerId, seq);
        }
        assignments.push({
            palioId,
            contradaId: pickCuffiaContradaId(contradaIds, lastWinSeq),
        });
    }
    return assignments;
}
/** Compatta run consecutivi; l’ultimo periodo ha `palioIdFine = null`. */
export function compactCuffiaAssignments(assignments) {
    if (assignments.length === 0)
        return [];
    const periods = [];
    let contradaId = assignments[0].contradaId;
    let inizio = assignments[0].palioId;
    let fine = assignments[0].palioId;
    for (let i = 1; i < assignments.length; i++) {
        const a = assignments[i];
        if (a.contradaId === contradaId) {
            fine = a.palioId;
        }
        else {
            periods.push({
                contradaId,
                palioIdInizio: inizio,
                palioIdFine: fine,
            });
            contradaId = a.contradaId;
            inizio = a.palioId;
            fine = a.palioId;
        }
    }
    periods.push({
        contradaId,
        palioIdInizio: inizio,
        palioIdFine: null,
    });
    return periods;
}
export function computeCuffiaPeriods(palioIdsChronological, winsByPalioId, contradaIds) {
    return compactCuffiaAssignments(buildCuffiaAssignments(palioIdsChronological, winsByPalioId, contradaIds));
}
//# sourceMappingURL=contrada-cuffia.js.map