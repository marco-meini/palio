import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { repoRoot } from './paths.js';

let loaded = false;

/**
 * Carica `.env` e `.env.local` dalla root del repo.
 * In Docker/prod le variabili sono già in process.env (env_file) — non sovrascriviamo.
 */
export function loadEnvFiles(): void {
  if (loaded || process.env.PALIO_SKIP_ENV_FILES === '1') {
    return;
  }
  loaded = true;

  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
  ];

  if (process.env.NODE_ENV === 'production') {
    candidates.unshift(path.join(repoRoot, '.env.production'));
  }

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      loadDotenv({ path: file, override: false });
    }
  }
}
