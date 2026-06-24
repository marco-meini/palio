export interface ICavalloRecord {
  cavallo_id: number;
  cavallo_nome: string;
}

export interface IFantinoRecord {
  fantino_id: number;
  fantino_nome: string;
  fantino_soprannome: string;
}

export interface IPalioRecord {
  palio_id: number;
  palio_straordinario: boolean;
  palio_note: string;
}

export interface IPalioContradaRecord {
  pc_palio_id: number;
  pc_contrada_id: number;
  pc_vincente: boolean;
  pc_estratta: boolean;
  pc_fantino_id: number;
  pc_cavallo_id: number;
  pc_canape: number;
}

export type CavalloInsert = Pick<ICavalloRecord, 'cavallo_nome'>;
export type FantinoInsert = Pick<IFantinoRecord, 'fantino_nome' | 'fantino_soprannome'>;
