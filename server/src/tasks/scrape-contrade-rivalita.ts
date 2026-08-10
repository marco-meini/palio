#!/usr/bin/env node
// @ts-nocheck
/**
 * Import rivalità tra contrade da ilpalio.siena.it (?rivalita).
 * Idempotente: DELETE + reinsert di tutta contrada_rivalita.
 */
import pg from 'pg';
import { loadEnvFiles } from '../load-env.js';
import { loadPgConfig } from '../lib/db-config.js';
import { fetchHtml, sleep } from '../lib/https-requests.js';
import { CONTRADA_CODE_TO_NAME, nameFromCode } from '../lib/contrade-codes.js';
import { loadContradeMap } from '../lib/entities.js';
import { parseRivalita, rivalitaUrl } from '../lib/ilpalio-parser.js';

loadEnvFiles();

const ALL_CODES = Object.keys(CONTRADA_CODE_TO_NAME);

const HELP_TEXT = `Usage: npx tsx src/tasks/scrape-contrade-rivalita.ts [options]

Fetch /5/Contrade/{CODE}?rivalita for all 17 contrade and replace contrada_rivalita.

Options:
  --delay-ms MS   Pause between HTTP requests (default: 800)
  --fail-fast     Stop on first fetch/parse error
  --help          Show this help
`;

function parseArgs(argv) {
  const opts = { delayMs: 800, failFast: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--delay-ms' && argv[i + 1]) opts.delayMs = Number(argv[++i]);
    else if (a === '--fail-fast') opts.failFast = true;
    else if (a === '--help') {
      console.log(HELP_TEXT);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

/**
 * @param {Map<string, number>} contradeByName
 * @param {string} codeA
 * @param {{ rivaleCode: string, dataInizio: string|null, dataFine: string|null }} row
 */
function normalizePair(contradeByName, codeA, row) {
  const nameA = nameFromCode(codeA);
  const nameB = nameFromCode(row.rivaleCode);
  const idA = contradeByName.get(nameA);
  const idB = contradeByName.get(nameB);
  if (idA == null || idB == null) {
    throw new Error(`Unknown contrada id for ${nameA}/${nameB}`);
  }
  if (idA === idB) {
    throw new Error(`Self-rivalry for ${nameA}`);
  }
  return {
    contradaId: Math.min(idA, idB),
    rivaleId: Math.max(idA, idB),
    dataInizio: row.dataInizio,
    dataFine: row.dataFine,
  };
}

function pairKey(p) {
  return `${p.contradaId}|${p.rivaleId}|${p.dataInizio ?? ''}|${p.dataFine ?? ''}`;
}

async function main() {
  const opts = parseArgs(process.argv);
  const pool = new pg.Pool(loadPgConfig());
  const client = await pool.connect();
  const errors = [];
  /** @type {Map<string, { contradaId: number, rivaleId: number, dataInizio: string|null, dataFine: string|null }>} */
  const pairs = new Map();

  try {
    const contradeByName = await loadContradeMap(client);

    for (let i = 0; i < ALL_CODES.length; i++) {
      const code = ALL_CODES[i];
      const url = rivalitaUrl(code);
      console.error(`[${i + 1}/${ALL_CODES.length}] ${code} ${url}`);
      try {
        const html = await fetchHtml(url, { delayMs: i === 0 ? 0 : opts.delayMs });
        const parsed = parseRivalita(html);
        for (const row of parsed) {
          const pair = normalizePair(contradeByName, code, row);
          pairs.set(pairKey(pair), pair);
        }
        console.error(`  → ${parsed.length} period(s)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  SKIP: ${msg}`);
        errors.push({ code, msg });
        if (opts.failFast) throw err;
      }
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM contrada_rivalita');
    for (const p of pairs.values()) {
      await client.query(
        `INSERT INTO contrada_rivalita (contrada_id, rivale_id, data_inizio, data_fine)
         VALUES ($1, $2, $3, $4)`,
        [p.contradaId, p.rivaleId, p.dataInizio, p.dataFine],
      );
    }
    await client.query('COMMIT');
    console.error(`imported ${pairs.size} unique rivalry periods`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({ imported: pairs.size, errors }, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
