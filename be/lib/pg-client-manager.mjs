import pg from "pg";

export class PgClientManager {
  constructor(config, __logger) {
    this.__pool = new pg.Pool(config);
  }

  async startTransaction() {
    let transactionClient = null;
    try {
      transactionClient = await this.__pool.connect();
      await transactionClient.query("BEGIN");
      return Promise.resolve(transactionClient);
    } catch (e) {
      if (transactionClient) transactionClient.release();
      return Promise.reject(e);
    }
  }

  async commit(transactionClient) {
    try {
      if (transactionClient) {
        await transactionClient.query("COMMIT");
        transactionClient.release();
        return Promise.resolve();
      } else {
        return Promise.reject(new Error("Try to commit a not initialized transaction"));
      }
    } catch (e) {
      if (transactionClient) transactionClient.release();
      return Promise.reject(e);
    }
  }

  async rollback(transactionClient) {
    try {
      if (transactionClient) {
        await transactionClient.query("ROLLBACK");
        transactionClient.release();
        return Promise.resolve();
      } else {
        return Promise.reject(new Error("Try to rollback a not initialized transaction"));
      }
    } catch (e) {
      if (transactionClient) transactionClient.release();
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {string} sql
   * @param {Array<any>} replacements
   * @param {pg.PoolClient} transactionClient
   */
  async query(sql, replacements = [], transactionClient = null) {
    try {
      if (this.__logger) {
        this.__logger(sql);
        if (replacements && replacements.length) this.__logger(`REPLACEMENT: ${JSON.stringify(replacements)}`);
      }
      if (transactionClient) {
        return transactionClient.query(sql, replacements);
      } else {
        return this.__pool.query(sql, replacements);
      }
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   *
   * @param {string} sql
   * @param {Array<any>} replacements
   * @param {pg.PoolClient} transactionClient
   */
  async queryReturnFirst(sql, replacements = [], transactionClient = null) {
    try {
      if (this.__logger) {
        this.__logger(sql);
        if (replacements && replacements.length) this.__logger(`REPLACEMENT: ${JSON.stringify(replacements)}`);
      }
      let result = null;
      if (transactionClient) {
        result = await transactionClient.query(sql, replacements);
      } else {
        result = await this.__pool.query(sql, replacements);
      }
      if (result.rowCount > 0) {
        return Promise.resolve(result.rows[0]);
      } else {
        return Promise.resolve(null);
      }
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async insert(item, tableName) {
    try {
      let columns = [];
      let values = [];
      let indexes = [];
      let k = 1;
      for (let p in item) {
        columns.push(p);
        values.push(item[p]);
        indexes.push(`$${k}`);
        k++;
      }
      let sql = `insert into ${tableName} (${columns.join(",")}) values (${indexes.join(",")}) returning *`;
      let insertedItem = await this.queryReturnFirst(sql, values);
      return Promise.resolve(insertedItem);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async updateByKey(item, fieldsToUpdate, keys, tableName) {
    try {
      let sets = [];
      let where = [];
      let values = [];
      let k = 1;
      for (let p in item) {
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
        let sql = `update ${tableName} SET ${sets.join(",")}`;
        if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
        await this.query(sql, values);
      }

      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async disconnect() {
    await this.__pool.end();
  }
}
