import type { Db } from '../lib/db.js';
import type { PalioFilters } from '../lib/palii/palii-dto.js';

/** Palio con la vincitrice (riga dell'elenco). */
export interface PalioSummaryRow {
  id: number;
  data: string;
  straordinario: boolean;
  pittore_drappellone: string | null;
  vincitrice: string | null;
  fantino_nome: string | null;
  fantino_soprannome: string | null;
  cavallo: string | null;
}

export interface PalioNavRow extends PalioSummaryRow {
  previous_id: number | null;
  next_id: number | null;
}

export interface PartecipazioneRow {
  contrada: string;
  vincitrice: boolean;
  non_partecipa: boolean;
  canape: number | null;
  ordine: number | null;
  estratta: boolean;
  estratta_da: string | null;
  ordine_assegnazione: number | null;
  orecchio: number | null;
  coscia: number | null;
  cavallo: string | null;
  proprietario_cavallo: string | null;
  cavallo_preso_da: string | null;
  fantino_nome: string | null;
  fantino_soprannome: string | null;
  ordine_arrivo: number | null;
  giro_caduta: number | null;
  capitano: string | null;
  priore: string | null;
  barbaresco: string | null;
  mangini: string[];
}

export interface ProvaRow {
  numero: number;
  contrada: string;
  canape: number | null;
  non_partecipa: boolean;
  fantino_nome: string | null;
  fantino_soprannome: string | null;
}

/** Vincitrice del Palio (una sola riga anche con dati incoerenti). */
const WINNER_JOIN = `
  LEFT JOIN LATERAL (
    SELECT pp.contrada_id, c.name AS vincitrice, f.nome AS fantino_nome,
           f.soprannome AS fantino_soprannome, ca.nome AS cavallo
      FROM palio_partecipazioni pp
      JOIN contrade c ON c.id = pp.contrada_id
      LEFT JOIN fantini f ON f.id = pp.fantino_id
      LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
     WHERE pp.palio_id = p.id AND pp.vincitrice
     ORDER BY pp.id
     LIMIT 1
  ) w ON true`;

const SUMMARY_COLUMNS = `
  p.id, to_char(p.data_palio, 'YYYY-MM-DD') AS data, p.straordinario, p.pittore_drappellone,
  w.vincitrice, w.fantino_nome, w.fantino_soprannome, w.cavallo`;

/** Archivio dei Palii in sola lettura, per la pagina Palii (`palii.view`). */
export class ModelPaliiArchive {
  constructor(private readonly db: Db) {}

  async list(
    filters: PalioFilters,
    limit: number,
    offset: number,
  ): Promise<{ rows: PalioSummaryRow[]; total: number }> {
    const q = filters.q ? `%${escapeLike(filters.q)}%` : null;
    const rows = await this.db.query<PalioSummaryRow & { total: number }>(
      `SELECT ${SUMMARY_COLUMNS}, count(*) OVER () AS total
         FROM palii p
         ${WINNER_JOIN}
        WHERE ($1::int IS NULL OR extract(year FROM p.data_palio) >= $1)
          AND ($2::int IS NULL OR extract(year FROM p.data_palio) <= $2)
          AND ($3::int IS NULL OR w.contrada_id = $3)
          AND ($4::boolean IS NULL OR p.straordinario = $4)
          AND ($5::text IS NULL OR EXISTS (
                SELECT 1
                  FROM palio_partecipazioni x
                  LEFT JOIN fantini xf ON xf.id = x.fantino_id
                  LEFT JOIN cavalli xc ON xc.id = x.cavallo_id
                 WHERE x.palio_id = p.id
                   AND (xf.nome ILIKE $5 OR xf.soprannome ILIKE $5 OR xc.nome ILIKE $5)))
        ORDER BY p.data_palio DESC, p.id DESC
        LIMIT $6 OFFSET $7`,
      [
        filters.yearFrom ?? null,
        filters.yearTo ?? null,
        filters.winnerId ?? null,
        filters.kind ? filters.kind === 'straordinari' : null,
        q,
        limit,
        offset,
      ],
    );
    const total = rows[0]?.total ?? (offset > 0 ? await this.count(filters) : 0);
    return { rows: rows.map(({ total: _total, ...row }) => row), total };
  }

  /** Totale quando la pagina chiesta è oltre la fine (nessuna riga da cui leggerlo). */
  private async count(filters: PalioFilters): Promise<number> {
    const { total } = await this.list(filters, 1, 0);
    return total;
  }

  async get(id: number): Promise<PalioNavRow | null> {
    return this.db.queryOne<PalioNavRow>(
      `SELECT ${SUMMARY_COLUMNS},
              (SELECT n.id FROM palii n
                WHERE (n.data_palio, n.id) < (p.data_palio, p.id)
                ORDER BY n.data_palio DESC, n.id DESC LIMIT 1) AS previous_id,
              (SELECT n.id FROM palii n
                WHERE (n.data_palio, n.id) > (p.data_palio, p.id)
                ORDER BY n.data_palio, n.id LIMIT 1) AS next_id
         FROM palii p
         ${WINNER_JOIN}
        WHERE p.id = $1`,
      [id],
    );
  }

  async partecipazioni(palioId: number): Promise<PartecipazioneRow[]> {
    return this.db.query<PartecipazioneRow>(
      `SELECT c.name AS contrada, pp.vincitrice, pp.non_partecipa, pp.canape, pp.ordine,
              pp.estratta, ec.name AS estratta_da, pp.ordine_assegnazione, pp.orecchio, pp.coscia,
              ca.nome AS cavallo, pp.proprietario_cavallo, pp.cavallo_preso_da,
              f.nome AS fantino_nome, f.soprannome AS fantino_soprannome,
              pp.ordine_arrivo, pp.giro_caduta,
              cap.nome AS capitano, pri.nome AS priore, bar.nome AS barbaresco,
              ARRAY(SELECT m.nome
                      FROM palio_partecipazione_mangini ppm
                      JOIN mangini m ON m.id = ppm.mangini_id
                     WHERE ppm.partecipazione_id = pp.id
                     ORDER BY ppm.ordine NULLS LAST, m.nome) AS mangini
         FROM palio_partecipazioni pp
         JOIN contrade c ON c.id = pp.contrada_id
         LEFT JOIN contrade ec ON ec.id = pp.estratta_da_id
         LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
         LEFT JOIN fantini f ON f.id = pp.fantino_id
         LEFT JOIN capitani cap ON cap.id = pp.capitano_id
         LEFT JOIN priori pri ON pri.id = pp.priore_id
         LEFT JOIN barbareschi bar ON bar.id = pp.barbaresco_id
        WHERE pp.palio_id = $1
        ORDER BY c.name`,
      [palioId],
    );
  }

  async prove(palioId: number): Promise<ProvaRow[]> {
    return this.db.query<ProvaRow>(
      `SELECT prv.numero, c.name AS contrada, prv.canape, prv.non_partecipa,
              f.nome AS fantino_nome, f.soprannome AS fantino_soprannome
         FROM palio_prove prv
         JOIN contrade c ON c.id = prv.contrada_id
         LEFT JOIN fantini f ON f.id = prv.fantino_id
        WHERE prv.palio_id = $1
        ORDER BY prv.numero, prv.canape NULLS LAST, c.name`,
      [palioId],
    );
  }

  async contrade(): Promise<{ id: number; name: string }[]> {
    return this.db.query<{ id: number; name: string }>('SELECT id, name FROM contrade ORDER BY name');
  }

  async yearRange(): Promise<{ min: number | null; max: number | null }> {
    const row = await this.db.queryOne<{ min: number | null; max: number | null }>(
      `SELECT extract(year FROM min(data_palio))::int AS min,
              extract(year FROM max(data_palio))::int AS max
         FROM palii`,
    );
    return row ?? { min: null, max: null };
  }
}

/** Testo cercato preso alla lettera in ILIKE (`%`, `_` e `\` non sono caratteri jolly). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
