// @ts-nocheck
import { toMarkdownTable } from './compact-tool-result.js';
export function formatQueryResultAsCli(result) {
    const count = result.rowCount ?? result.rows.length;
    if (!count) {
        return 'Statement 1 (0 rows)\n(nessuna riga)';
    }
    const headers = result.fields.map((f) => f.name);
    const rows = result.rows.map((row) => headers.map((h) => String(row[h] ?? '')));
    const md = toMarkdownTable(headers, rows);
    return `Statement 1 (${count} rows)\n${md}`;
}
export async function pgProfileTest(pg) {
    await pg.query('SELECT 1 AS ok');
    const via = process.env.DATABASE_URL ? 'DATABASE_URL' : 'pg pool';
    return `Connection OK (${via})`;
}
export async function pgListTables(pg) {
    const result = await pg.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
    const names = result.rows.map((r) => r.table_name).join('\n');
    return names || '(nessuna tabella)';
}
export async function pgSchemaInspect(pg) {
    const result = await pg.query(`
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);
    const byTable = {};
    for (const row of result.rows) {
        const t = String(row.table_name);
        if (!byTable[t])
            byTable[t] = [];
        byTable[t].push(`${row.column_name} (${row.data_type})`);
    }
    const parts = Object.entries(byTable).map(([table, cols]) => `${table}: ${cols.join(', ')}`);
    return parts.join('\n\n') || '(schema vuoto)';
}
export async function pgFindObjects(pg, pattern, types) {
    const like = `%${pattern.replace(/[%_\\]/g, '\\$&')}%`;
    const wantTables = !types || types.includes('table');
    const wantColumns = !types || types.includes('column');
    const lines = [];
    if (wantTables) {
        const t = await pg.query(`
      SELECT table_name AS name, 'table' AS kind
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name ILIKE $1
      ORDER BY 1
    `, [like]);
        for (const row of t.rows) {
            lines.push(`${row.kind}: ${row.name}`);
        }
    }
    if (wantColumns) {
        const c = await pg.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name ILIKE $1 OR column_name ILIKE $1)
      ORDER BY table_name, ordinal_position
    `, [like]);
        for (const row of c.rows) {
            lines.push(`column: ${row.table_name}.${row.column_name}`);
        }
    }
    return lines.join('\n') || '(nessun match)';
}
export async function pgRunQuery(pg, sql) {
    const result = await pg.query(sql);
    return formatQueryResultAsCli(result);
}
//# sourceMappingURL=pg-readonly-driver.js.map