import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../paths.js';
export function loadPgConfig(profile = process.env.DB_PROFILE || 'local') {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL };
    }
    const configPath = path.join(repoRoot, '.skills/postgres/config.toml');
    if (!fs.existsSync(configPath)) {
        throw new Error(`Missing ${configPath} and DATABASE_URL`);
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const sectionKey = `[tools.postgres.profiles.${profile}]`;
    const start = raw.indexOf(sectionKey);
    if (start === -1) {
        throw new Error(`Profile ${profile} not found in config.toml`);
    }
    const slice = raw.slice(start);
    const end = slice.indexOf('\n[', sectionKey.length);
    const block = end === -1 ? slice : slice.slice(0, end);
    const pick = (key) => {
        const m = block.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, 'm'));
        return m ? m[1].trim() : undefined;
    };
    return {
        host: pick('host'),
        port: Number(pick('port')),
        database: pick('database'),
        user: pick('user'),
        password: pick('password'),
    };
}
export function resolveApiPgConfig(config = {}) {
    if (process.env.DATABASE_URL) {
        return loadPgConfig();
    }
    const db = config.db;
    if (db?.host) {
        return {
            host: db.host,
            port: db.port ?? 5432,
            database: db.database,
            user: db.user,
            password: db.password,
        };
    }
    return loadPgConfig(process.env.DB_PROFILE || config.postgres?.profile || 'local');
}
//# sourceMappingURL=db-config.js.map