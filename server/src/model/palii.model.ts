import { PgClientManager } from '../lib/pg-client-manager.js';
import type { IPalioRecord } from './records.js';

export class ModelPalii {
  private __pgCLient: PgClientManager;

  constructor(pgClient: PgClientManager) {
    this.__pgCLient = pgClient;
  }

  async truncate(): Promise<void> {
    await this.__pgCLient.query('truncate table palii cascade');
  }

  async getPalioById(id: number): Promise<IPalioRecord | null> {
    return this.__pgCLient.queryReturnFirst<IPalioRecord>(
      `select *
      from palii
      where palio_id=$1`,
      [id],
    );
  }

  async insert(palio: IPalioRecord): Promise<IPalioRecord | null> {
    return this.__pgCLient.insert(palio, 'palii') as Promise<IPalioRecord | null>;
  }
}
