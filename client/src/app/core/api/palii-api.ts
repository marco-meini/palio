import { httpResource } from '@angular/common/http';
import { Injectable, signal, type Signal } from '@angular/core';

/** Contratto con l'API (stessi tipi in `server/src/lib/palii/palii-dto.ts`). */
export interface FantinoDto {
  nome: string;
  soprannome: string | null;
}

export interface PalioSummaryDto {
  id: number;
  /** `YYYY-MM-DD` */
  date: string;
  name: string;
  straordinario: boolean;
  pittore: string | null;
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
  yearMin: number | null;
  yearMax: number | null;
}

export interface PartecipazioneDto {
  contrada: string;
  vincitrice: boolean;
  nonPartecipa: boolean;
  canape: number | null;
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
  giroCaduta: number | null;
  capitano: string | null;
  priore: string | null;
  barbaresco: string | null;
  mangini: string[];
}

export interface ProvaEntryDto {
  contrada: string;
  canape: number | null;
  nonPartecipa: boolean;
  fantino: FantinoDto | null;
}

export interface ProvaDto {
  numero: number;
  name: string;
  entries: ProvaEntryDto[];
}

export interface PalioDetailDto extends PalioSummaryDto {
  previousId: number | null;
  nextId: number | null;
  contrade: PartecipazioneDto[];
  prove: ProvaDto[];
}

/** Filtri dell'elenco, come nella query string della pagina e dell'API. */
export interface PaliiQuery {
  annoDa?: string;
  annoA?: string;
  vincitrice?: string;
  tipo?: string;
  q?: string;
  pagina?: string;
}

/** Archivio dei Palii in sola lettura (`palii.view`). */
@Injectable({ providedIn: 'root' })
export class PaliiApi {
  /** Ultimo elenco visto (con i filtri), per tornarci dalla scheda di un Palio. */
  readonly listUrl = signal('/palii');

  list(query: Signal<PaliiQuery>) {
    return httpResource<PaliiPageDto>(() => ({ url: '/api/palii', params: clean(query()) }));
  }

  filters() {
    return httpResource<PaliiFiltersDto>(() => '/api/palii/filtri');
  }

  get(id: Signal<string | undefined>) {
    return httpResource<PalioDetailDto>(() => (id() ? `/api/palii/${id()}` : undefined));
  }
}

function clean(query: PaliiQuery): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== '')) as Record<
    string,
    string
  >;
}

/** Fantino come si dice a Siena: il soprannome se c'è, altrimenti il nome. */
export function fantinoName(fantino: FantinoDto | null): string {
  if (!fantino) return '';
  return fantino.soprannome || fantino.nome;
}

/** Nome completo, per il tooltip: «Mario Rossi detto Il Rosso». */
export function fantinoFullName(fantino: FantinoDto | null): string {
  if (!fantino) return '';
  return fantino.soprannome ? `${fantino.nome} detto ${fantino.soprannome}` : fantino.nome;
}

/** Posto al canape: 10 è la rincorsa. */
export function canapeLabel(canape: number | null): string {
  if (canape === null) return '';
  return canape === 10 ? 'Rincorsa' : String(canape);
}
