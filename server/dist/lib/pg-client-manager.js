import pg from 'pg';
export class PgClientManager {
    __pool;
    __logger;
    constructor(config, logger) {
        this.__logger = logger;
        this.__pool = new pg.Pool({
            ...config,
            connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
        });
    }
    async startTransaction() {
        let transactionClient = null;
        try {
            transactionClient = await this.__pool.connect();
            await transactionClient.query('BEGIN');
            return transactionClient;
        }
        catch (e) {
            if (transactionClient)
                transactionClient.release();
            throw e;
        }
    }
    async commit(transactionClient) {
        try {
            if (transactionClient) {
                await transactionClient.query('COMMIT');
                transactionClient.release();
            }
            else {
                throw new Error('Try to commit a not initialized transaction');
            }
        }
        catch (e) {
            if (transactionClient)
                transactionClient.release();
            throw e;
        }
    }
    async rollback(transactionClient) {
        try {
            if (transactionClient) {
                await transactionClient.query('ROLLBACK');
                transactionClient.release();
            }
            else {
                throw new Error('Try to rollback a not initialized transaction');
            }
        }
        catch (e) {
            if (transactionClient)
                transactionClient.release();
            throw e;
        }
    }
    async query(sql, replacements = [], transactionClient = null) {
        if (this.__logger) {
            this.__logger(sql);
            if (replacements?.length)
                this.__logger(`REPLACEMENT: ${JSON.stringify(replacements)}`);
        }
        if (transactionClient) {
            return transactionClient.query(sql, replacements);
        }
        return this.__pool.query(sql, replacements);
    }
    async queryReturnFirst(sql, replacements = [], transactionClient = null) {
        if (this.__logger) {
            this.__logger(sql);
            if (replacements?.length)
                this.__logger(`REPLACEMENT: ${JSON.stringify(replacements)}`);
        }
        const result = transactionClient
            ? await transactionClient.query(sql, replacements)
            : await this.__pool.query(sql, replacements);
        if (result.rowCount && result.rowCount > 0) {
            return result.rows[0];
        }
        return null;
    }
    async insert(item, tableName) {
        const columns = [];
        const values = [];
        const indexes = [];
        let k = 1;
        for (const p in item) {
            columns.push(p);
            values.push(item[p]);
            indexes.push(`$${k}`);
            k++;
        }
        const sql = `insert into ${tableName} (${columns.join(',')}) values (${indexes.join(',')}) returning *`;
        return this.queryReturnFirst(sql, values);
    }
    async updateByKey(item, fieldsToUpdate, keys, tableName) {
        const sets = [];
        const where = [];
        const values = [];
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
            if (where.length)
                sql += ` WHERE ${where.join(' AND ')}`;
            await this.query(sql, values);
        }
    }
    async disconnect() {
        await this.__pool.end();
    }
}
//# sourceMappingURL=pg-client-manager.js.map