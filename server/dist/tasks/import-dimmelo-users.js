#!/usr/bin/env node
/**
 * Porta su ZITADEL gli utenti della vecchia allowlist `dimmelo_users`: per ognuno collega
 * l'account con la stessa email (o lo crea) e gli dà accesso al progetto Dimmelo con il ruolo
 * `chat.use`. Chi ha già accesso viene saltato. Scrive su ZITADEL, non sul database.
 * Poi l'utente entra con Google (stessa email) o con una passkey, dal link d'invito che si
 * genera nella pagina Utenti.
 *
 * Usage: npm run import:dimmelo-users -- [--dry-run]
 * Serve: DATABASE_URL, ZITADEL_URL, ZITADEL_PROJECT_ID, ZITADEL_TOKEN, ZITADEL_ORG_ID.
 */
import pg from 'pg';
import { loadEnvFiles } from '../load-env.js';
import { loadPgConfig } from '../lib/db-config.js';
import { ZitadelService } from '../lib/zitadel.js';
loadEnvFiles();
function env(name) {
    const value = process.env[name];
    if (!value)
        throw new Error(`Variabile d'ambiente mancante: ${name}`);
    return value;
}
/** Nome e cognome da `display_name` (il cognome può mancare: ZITADEL lo vuole, si usa il nome). */
function splitName(displayName) {
    const [first = '', ...rest] = displayName.trim().split(/\s+/);
    return { firstName: first, lastName: rest.join(' ') || first };
}
async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const zitadel = new ZitadelService({
        url: env('ZITADEL_URL').replace(/\/+$/, ''),
        projectId: env('ZITADEL_PROJECT_ID'),
        token: env('ZITADEL_TOKEN'),
        organizationId: env('ZITADEL_ORG_ID'),
        loginV2: process.env['ZITADEL_LOGIN_V2'] === 'true',
    });
    const pool = new pg.Pool(loadPgConfig());
    try {
        const { rows } = await pool.query('SELECT email, display_name FROM dimmelo_users ORDER BY id');
        console.log(`${rows.length} utenti in dimmelo_users${dryRun ? ' (prova: nessuna modifica)' : ''}`);
        for (const row of rows) {
            const email = row.email.trim().toLowerCase();
            const existing = await zitadel.findUserByEmail(email);
            if (existing && (await zitadel.listGrants(existing.userId)).length > 0) {
                console.log(`= ${email}: ha già accesso a Dimmelo`);
                continue;
            }
            if (dryRun) {
                console.log(`+ ${email}: ${existing ? 'account esistente' : 'nuovo account'}, ruolo chat.use`);
                continue;
            }
            const { firstName, lastName } = splitName(row.display_name);
            const userId = existing?.userId ??
                (await zitadel.createUser({ email, firstName, lastName, displayName: row.display_name.trim() }));
            await zitadel.addGrant(userId, ['chat.use']);
            console.log(`+ ${email}: ${existing ? 'account esistente' : 'nuovo account'} ${userId}, ruolo chat.use`);
        }
    }
    finally {
        await pool.end();
    }
}
main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
//# sourceMappingURL=import-dimmelo-users.js.map