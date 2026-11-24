/**
 * Pulsanti: stessa forma e dimensione per tutti, cambia solo il colore secondo il ruolo.
 * Nelle modali si usano tramite `<app-modal-actions>`.
 */
const BUTTON =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-60';

/** Azione principale (salva, aggiungi). */
export const BUTTON_PRIMARY = `${BUTTON} bg-amber-700 text-white hover:bg-amber-800`;

/** Azione secondaria (annulla). */
export const BUTTON_SECONDARY = `${BUTTON} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`;

/** Azione distruttiva da confermare (elimina). */
export const BUTTON_DANGER = `${BUTTON} border border-red-200 bg-white text-red-700 hover:bg-red-50`;

/** Conferma di un'azione distruttiva (sì, elimina). */
export const BUTTON_DANGER_CONFIRM = `${BUTTON} bg-red-600 text-white hover:bg-red-700`;
