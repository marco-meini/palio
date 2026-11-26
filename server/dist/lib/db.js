/** OID di `int8` (bigint): `pg` lo restituisce come stringa. */
const INT8 = 20;
/**
 * Righe con le colonne `bigint` (id, count) come `number` (sicuro fino a 2^53), come in dimora.
 * Solo qui, non con un parser globale: chat, MCP e scraper restano come sono.
 */
export function rowsOf(result) {
    const int8 = (result.fields ?? []).filter((f) => f.dataTypeID === INT8).map((f) => f.name);
    if (int8.length === 0)
        return result.rows;
    return result.rows.map((row) => {
        const out = { ...row };
        for (const name of int8) {
            const value = out[name];
            if (typeof value === 'string')
                out[name] = Number.parseInt(value, 10);
        }
        return out;
    });
}
function makeDb(run, transaction) {
    return {
        async query(sql, params = []) {
            return rowsOf(await run(sql, params));
        },
        async queryOne(sql, params = []) {
            return rowsOf(await run(sql, params))[0] ?? null;
        },
        async execute(sql, params = []) {
            return (await run(sql, params)).rowCount ?? 0;
        },
        transaction,
    };
}
export function createDb(pg) {
    const db = makeDb((sql, params) => pg.query(sql, params), async (fn) => {
        const client = await pg.startTransaction();
        // transazioni annidate: si riusa quella esterna
        const tx = makeDb((sql, params) => client.query(sql, params), (inner) => inner(tx));
        try {
            const result = await fn(tx);
            await pg.commit(client);
            return result;
        }
        catch (error) {
            await pg.rollback(client);
            throw error;
        }
    });
    return db;
}
//# sourceMappingURL=db.js.map