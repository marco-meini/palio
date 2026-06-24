// @ts-nocheck
export function normalizeNome(nome) {
    return String(nome || '').replace(/\s+/g, ' ').trim();
}
export async function getOrCreateCavallo(client, { sourceId, nome }) {
    const { rows } = await client.query(`INSERT INTO cavalli (source_id, nome)
     VALUES ($1, $2)
     ON CONFLICT (source_id) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`, [sourceId, normalizeNome(nome)]);
    return rows[0].id;
}
export async function getOrCreateFantino(client, { sourceId, nome, soprannome }, opts = {}) {
    const n = normalizeNome(nome);
    const s = soprannome ? normalizeNome(soprannome) : null;
    const existing = await client.query('SELECT id, nome FROM fantini WHERE source_id = $1', [sourceId]);
    if (existing.rows[0]) {
        const id = existing.rows[0].id;
        await client.query(`UPDATE fantini
       SET nome = CASE WHEN $2::boolean THEN $3 ELSE nome END,
           soprannome = COALESCE($4, soprannome)
       WHERE id = $1`, [id, Boolean(opts.fullNome), n, s]);
        return id;
    }
    const insertNome = n || s || '';
    const { rows } = await client.query(`INSERT INTO fantini (source_id, nome, soprannome) VALUES ($1, $2, $3) RETURNING id`, [sourceId, insertNome, s]);
    return rows[0].id;
}
async function getOrCreateByNome(client, table, nome) {
    const n = normalizeNome(nome);
    if (!n)
        return null;
    const { rows } = await client.query(`INSERT INTO ${table} (nome)
     VALUES ($1)
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`, [n]);
    return rows[0].id;
}
export const getOrCreateCapitano = (client, nome) => getOrCreateByNome(client, 'capitani', nome);
export const getOrCreateMangini = (client, nome) => getOrCreateByNome(client, 'mangini', nome);
export const getOrCreateBarbaresco = (client, nome) => getOrCreateByNome(client, 'barbareschi', nome);
export const getOrCreatePriore = (client, nome) => getOrCreateByNome(client, 'priori', nome);
export async function loadContradeMap(client) {
    const { rows } = await client.query('SELECT id, name FROM contrade');
    const map = new Map();
    for (const row of rows) {
        map.set(row.name, row.id);
    }
    return map;
}
//# sourceMappingURL=entities.js.map