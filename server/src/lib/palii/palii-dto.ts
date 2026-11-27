/** DTO dell'archivio dei Palii (`/api/palii`), uguali nel client (`core/api/palii-api.ts`). */

export type PalioKind = 'ordinari' | 'straordinari';

export interface PalioFilters {
  /** Anno minimo e massimo, compresi. */
  yearFrom?: number;
  yearTo?: number;
  /** Contrada vincitrice. */
  winnerId?: number;
  kind?: PalioKind;
  /** Testo cercato tra fantini (nome o soprannome) e cavalli di chi ha corso. */
  q?: string;
  /** Pagina, da 1. */
  page: number;
}

export interface FantinoDto {
  nome: string;
  soprannome: string | null;
}

export interface PalioSummaryDto {
  id: number;
  /** `YYYY-MM-DD` */
  date: string;
  /** Es. «Palio dell'Assunta», «Palio di Provenzano», «Palio straordinario». */
  name: string;
  straordinario: boolean;
  pittore: string | null;
  /** `null` se il Palio non ha una vincitrice (es. non corso o annullato). */
  winner: { contrada: string; fantino: FantinoDto | null; cavallo: string | null } | null;
}

export interface PaliiPageDto {
  items: PalioSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaliiFiltersDto {
  contrade: { id: number; name: string }[];
  /** Primo e ultimo anno in archivio (`null` se vuoto). */
  yearMin: number | null;
  yearMax: number | null;
}

/** Una contrada in un Palio (`palio_partecipazioni`). */
export interface PartecipazioneDto {
  contrada: string;
  vincitrice: boolean;
  nonPartecipa: boolean;
  /** Posto al canape 1–9; 10 = rincorsa. */
  canape: number | null;
  /** Ordine di estrazione (posto alle trifore). */
  ordine: number | null;
  estratta: boolean;
  estrattaDa: string | null;
  ordineAssegnazione: number | null;
  orecchio: number | null;
  coscia: number | null;
  cavallo: string | null;
  proprietarioCavallo: string | null;
  cavalloPresoDa: string | null;
  fantino: FantinoDto | null;
  ordineArrivo: number | null;
  /** Giro della caduta (1–3), `null` se non è caduta. */
  giroCaduta: number | null;
  capitano: string | null;
  priore: string | null;
  barbaresco: string | null;
  mangini: string[];
}

/** Canape e fantino di una contrada in una prova. */
export interface ProvaEntryDto {
  contrada: string;
  canape: number | null;
  nonPartecipa: boolean;
  fantino: FantinoDto | null;
}

export interface ProvaDto {
  /** 1–4 Prima…Quarta, 5 Prova generale, 6 Provaccia. */
  numero: number;
  name: string;
  entries: ProvaEntryDto[];
}

export interface PalioDetailDto extends PalioSummaryDto {
  /** Palio precedente e successivo in ordine di data, per scorrere l'archivio. */
  previousId: number | null;
  nextId: number | null;
  contrade: PartecipazioneDto[];
  prove: ProvaDto[];
}
