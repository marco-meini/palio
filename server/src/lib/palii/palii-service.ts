import type {
  ModelPaliiArchive,
  PalioSummaryRow,
  PartecipazioneRow,
  ProvaRow,
} from '../../model/palii-archive.model.js';
import { notFound } from '../http-error.js';
import type {
  FantinoDto,
  PaliiFiltersDto,
  PaliiPageDto,
  PalioDetailDto,
  PalioFilters,
  PalioSummaryDto,
  PartecipazioneDto,
  ProvaDto,
} from './palii-dto.js';

export const PAGE_SIZE = 50;

const PROVE = ['Prima prova', 'Seconda prova', 'Terza prova', 'Quarta prova', 'Prova generale', 'Provaccia'];

/** Archivio dei Palii in sola lettura: elenco filtrato e scheda completa di un Palio. */
export class PaliiService {
  constructor(private readonly model: ModelPaliiArchive) {}

  async list(filters: PalioFilters): Promise<PaliiPageDto> {
    const { rows, total } = await this.model.list(filters, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE);
    return { items: rows.map(toSummary), total, page: filters.page, pageSize: PAGE_SIZE };
  }

  async get(id: number): Promise<PalioDetailDto> {
    const palio = await this.model.get(id);
    if (!palio) throw notFound('Palio non trovato');
    const [contrade, prove] = await Promise.all([this.model.partecipazioni(id), this.model.prove(id)]);
    return {
      ...toSummary(palio),
      previousId: palio.previous_id,
      nextId: palio.next_id,
      contrade: contrade.map(toPartecipazione),
      prove: groupProve(prove),
    };
  }

  async filters(): Promise<PaliiFiltersDto> {
    const [contrade, years] = await Promise.all([this.model.contrade(), this.model.yearRange()]);
    return { contrade, yearMin: years.min, yearMax: years.max };
  }
}

/** Nome del Palio dalla data: luglio Provenzano, agosto Assunta. */
export function palioName(date: string, straordinario: boolean): string {
  if (straordinario) return 'Palio straordinario';
  const month = Number(date.slice(5, 7));
  if (month === 7) return 'Palio di Provenzano';
  if (month === 8) return "Palio dell'Assunta";
  return 'Palio';
}

function fantino(nome: string | null, soprannome: string | null): FantinoDto | null {
  return nome ? { nome, soprannome } : null;
}

function toSummary(row: PalioSummaryRow): PalioSummaryDto {
  return {
    id: row.id,
    date: row.data,
    name: palioName(row.data, row.straordinario),
    straordinario: row.straordinario,
    pittore: row.pittore_drappellone,
    winner: row.vincitrice
      ? {
          contrada: row.vincitrice,
          fantino: fantino(row.fantino_nome, row.fantino_soprannome),
          cavallo: row.cavallo,
        }
      : null,
  };
}

function toPartecipazione(row: PartecipazioneRow): PartecipazioneDto {
  return {
    contrada: row.contrada,
    vincitrice: row.vincitrice,
    nonPartecipa: row.non_partecipa,
    canape: row.canape,
    ordine: row.ordine,
    estratta: row.estratta,
    estrattaDa: row.estratta_da,
    ordineAssegnazione: row.ordine_assegnazione,
    orecchio: row.orecchio,
    coscia: row.coscia,
    cavallo: row.cavallo,
    proprietarioCavallo: row.proprietario_cavallo,
    cavalloPresoDa: row.cavallo_preso_da,
    fantino: fantino(row.fantino_nome, row.fantino_soprannome),
    ordineArrivo: row.ordine_arrivo,
    giroCaduta: row.giro_caduta,
    capitano: row.capitano,
    priore: row.priore,
    barbaresco: row.barbaresco,
    mangini: row.mangini ?? [],
  };
}

function groupProve(rows: ProvaRow[]): ProvaDto[] {
  const byNumero = new Map<number, ProvaDto>();
  for (const row of rows) {
    let prova = byNumero.get(row.numero);
    if (!prova) {
      prova = { numero: row.numero, name: PROVE[row.numero - 1] ?? `Prova ${row.numero}`, entries: [] };
      byNumero.set(row.numero, prova);
    }
    prova.entries.push({
      contrada: row.contrada,
      canape: row.canape,
      nonPartecipa: row.non_partecipa,
      fantino: fantino(row.fantino_nome, row.fantino_soprannome),
    });
  }
  return [...byNumero.values()].sort((a, b) => a.numero - b.numero);
}
