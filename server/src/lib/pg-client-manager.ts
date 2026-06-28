import pg from 'pg';

export class PgClientManager {
  private __pool: pg.Pool;
  private __logger?: (msg: string) => void;

  constructor(config: pg.PoolConfig, logger?: (msg: string) => void) {
    this.__logger = logger;
    this.__pool = new pg.Pool({
      ...config,
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    });
  }

  async withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.__pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async startTransaction() {
    let transactionClient: pg.PoolClient | null = null;
    try {
      transactionClient = await this.__pool.connect();
      await transactionClient.query('BEGIN');
      return transactionClient;
    } catch (e) {
      if (transactionClient) transactionClient.release();
      throw e;
    }
  }

  async commit(transactionClient: pg.PoolClient | null) {
    try {
      if (transactionClient) {
        await transactionClient.query('COMMIT');
        transactionClient.release();
      } else {
        throw new Error('Try to commit a not initialized transaction');
      }
    } catch (e) {
      if (transactionClient) transactionClient.release();
      throw e;
    }
  }

  async rollback(transactionClient: pg.PoolClient | null) {
    try {
      if (transactionClient) {
        await transactionClient.query('ROLLBACK');
        transactionClient.release();
      } else {
        throw new Error('Try to rollback a not initialized transaction');
      }
    } catch (e) {
      if (transactionClient) transactionClient.release();
      throw e;
    }
  }

  /**
   * Esegue una singola query read-only in envelope transazionale (chat / MCP).
   * Usa protocollo extended (prepared) e distrugge la connessione al rilascio.
   */
  async queryReadOnly(sql: string, options: { timeoutMs?: number } = {}) {
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? 30_000));
    const client = await this.__pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
      const result = await client.query({
        text: sql,
        name: `ro_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      });
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore rollback failure */
      }
      throw e;
    } finally {
      client.release(true);
    }
  }

  async query(sql: string, replacements: unknown[] = [], transactionClient: pg.PoolClient | null = null) {
    if (this.__logger) {
      this.__logger(sql);
      if (replacements?.length) this.__logger(`REPLACEMENT: ${JSON.stringify(replacements)}`);
    }
    if (transactionClient) {
      return transactionClient.query(sql, replacements);
    }
    return this.__pool.query(sql, replacements);
  }

  async queryReturnFirst<T = Record<string, unknown>>(
    sql: string,
    replacements: unknown[] = [],
    transactionClient: pg.PoolClient | null = null,
  ): Promise<T | null> {
    if (this.__logger) {
      this.__logger(sql);
      if (replacements?.length) this.__logger(`REPLACEMENT: ${JSON.stringify(replacements)}`);
    }
    const result = transactionClient
      ? await transactionClient.query(sql, replacements)
      : await this.__pool.query(sql, replacements);
    if (result.rowCount && result.rowCount > 0) {
      return result.rows[0] as T;
    }
    return null;
  }

  async insert<T extends object>(item: T, tableName: string): Promise<T | null> {
    const columns: string[] = [];
    const values: unknown[] = [];
    const indexes: string[] = [];
    let k = 1;
    for (const p in item) {
      columns.push(p);
      values.push(item[p]);
      indexes.push(`$${k}`);
      k++;
    }
    const sql = `insert into ${tableName} (${columns.join(',')}) values (${indexes.join(',')}) returning *`;
    return this.queryReturnFirst<T>(sql, values);
  }

  async updateByKey(
    item: Record<string, unknown>,
    fieldsToUpdate: string[],
    keys: string[],
    tableName: string,
  ) {
    const sets: string[] = [];
    const where: string[] = [];
    const values: unknown[] = [];
    let k = 1;
    for (const p in item) {
      if (fieldsToUpdate.indexOf(p) >= 0) {
        sets.push(`${p}=$${k}`);
        values.push(item[p]);
        k++;
      }
      if (keys.indexOf(p) >= 0) {
        where.push(`${p}=$${k}`);
        values.push(item[p]);
        k++;
      }
    }

    if (sets.length) {
      let sql = `update ${tableName} SET ${sets.join(',')}`;
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      await this.query(sql, values);
    }
  }

  async disconnect() {
    await this.__pool.end();
  }
}
