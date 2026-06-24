import { PgClientManager } from '../lib/pg-client-manager.js';
import type { CavalloInsert, ICavalloRecord } from './records.js';

export class ModelCavalli {
  private __pgCLient: PgClientManager;

  constructor(pgClient: PgClientManager) {
    this.__pgCLient = pgClient;
  }

  async truncate(): Promise<void> {
    await this.__pgCLient.query('truncate table cavalli cascade');
  }

  async getCavalloByNome(nome: string): Promise<ICavalloRecord | null> {
    return this.__pgCLient.queryReturnFirst<ICavalloRecord>(
      'select * from cavalli where cavallo_nome=$1',
      [nome],
    );
  }

  async insert(cavallo: CavalloInsert): Promise<ICavalloRecord | null> {
    return this.__pgCLient.insert(cavallo, 'cavalli') as Promise<ICavalloRecord | null>;
  }
}
