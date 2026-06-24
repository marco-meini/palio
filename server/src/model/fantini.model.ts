import { PgClientManager } from '../lib/pg-client-manager.js';
import type { FantinoInsert, IFantinoRecord } from './records.js';

export class ModelFantini {
  private __pgCLient: PgClientManager;

  constructor(pgClient: PgClientManager) {
    this.__pgCLient = pgClient;
  }

  async truncate(): Promise<void> {
    await this.__pgCLient.query('truncate table fantini cascade');
  }

  async getFantinoBySoprannome(detto: string): Promise<IFantinoRecord | null> {
    return this.__pgCLient.queryReturnFirst<IFantinoRecord>(
      'select * from fantini where fantino_soprannome=$1',
      [detto],
    );
  }

  async insert(fantino: FantinoInsert): Promise<IFantinoRecord | null> {
    return this.__pgCLient.insert(fantino, 'fantini') as Promise<IFantinoRecord | null>;
  }

  async updateNome(fantino: Pick<IFantinoRecord, 'fantino_id' | 'fantino_nome'>): Promise<void> {
    await this.__pgCLient.query('update fantini set fantino_nome=$1 where fantino_id=$2', [
      fantino.fantino_nome,
      fantino.fantino_id,
    ]);
  }
}
