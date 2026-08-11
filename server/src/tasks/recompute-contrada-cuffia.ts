#!/usr/bin/env node
/**
 * Ricalcola contrada_cuffia da palio_partecipazioni.vincitrice (full rebuild).
 *
 * Usage: npx tsx src/tasks/recompute-contrada-cuffia.ts
 */
import pg from 'pg';
import { loadEnvFiles } from '../load-env.js';
import { loadPgConfig } from '../lib/db-config.js';
import { recomputeContradaCuffia } from '../lib/recompute-contrada-cuffia.js';

loadEnvFiles();

async function main() {
  const pool = new pg.Pool(loadPgConfig());
  try {
    const result = await recomputeContradaCuffia(pool);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
