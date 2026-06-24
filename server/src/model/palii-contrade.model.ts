import { PgClientManager } from '../lib/pg-client-manager.js';
import type { IPalioContradaRecord } from './records.js';

export class ModelPaliiContrade {
  private __pgCLient: PgClientManager;

  constructor(pgClient: PgClientManager) {
    this.__pgCLient = pgClient;
  }

  async truncate(): Promise<void> {
    await this.__pgCLient.query('truncate table palii_contrade');
  }

  async insert(palio: IPalioContradaRecord): Promise<IPalioContradaRecord | null> {
    return this.__pgCLient.insert(palio, 'palii_contrade') as Promise<IPalioContradaRecord | null>;
  }
}
