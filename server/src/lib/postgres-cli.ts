// @ts-nocheck
import { spawn } from 'node:child_process';
import { getConfig } from '../config.js';
import {
  pgFindObjects,
  pgListTables,
  pgProfileTest,
  pgRunQuery,
  pgSchemaInspect,
} from './pg-readonly-driver.js';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 200_000;
/** Limite per risultati tool passati al modello (chat) */
export const TOOL_RESULT_MAX_CHARS = 6000;
const MAX_ROWS_HINT = 500;
const SCHEMA_CACHE_TTL_MS = 60 * 60 * 1000;

const FORBIDDEN_KEYWORD =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|migration)\b/i;
const ALLOWED_START = /^(SELECT|WITH|EXPLAIN)\b/i;

const schemaCache: { data: string | null; expiresAt: number } = { data: null, expiresAt: 0 };

let sharedPg: import('./pg-client-manager.js').PgClientManager | null = null;

/**
 * Usa il driver `pg` (Docker / DATABASE_URL) invece della skill Postgres CLI.
 */
export function initPostgresCliPool(pg) {
  sharedPg = pg;
}

function usePgDriver() {
  return sharedPg != null || Boolean(process.env.DATABASE_URL);
}

export function resolvePostgresCli() {
  return getConfig().postgres?.cli ?? '';
}

export function resolveProjectRoot() {
  return getConfig().postgres?.projectRoot ?? '';
}

export function resolveDbProfile() {
  return getConfig().postgres?.profile ?? 'local';
}

/**
 * Strip SQL line and block comments for guardrail checks.
 */
export function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/**
 * Split SQL into individual statements (semicolon-delimited, respecting quotes).
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inSingle && !inDouble && !dollarTag && ch === '-' && next === '-') {
      current += ch;
      i += 1;
      current += sql[i];
      while (i + 1 < sql.length && sql[i + 1] !== '\n') {
        i += 1;
        current += sql[i];
      }
      continue;
    }

    if (!inSingle && !inDouble && !dollarTag && ch === '/' && next === '*') {
      current += ch;
      i += 1;
      current += sql[i];
      while (i + 1 < sql.length - 1 && !(sql[i + 1] === '*' && sql[i + 2] === '/')) {
        i += 1;
        current += sql[i];
      }
      if (i + 1 < sql.length) {
        i += 1;
        current += sql[i];
        if (i + 1 < sql.length) {
          i += 1;
          current += sql[i];
        }
      }
      continue;
    }

    if (!inDouble && !dollarTag && ch === "'") {
      if (inSingle && next === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inSingle && !dollarTag && ch === '"') {
      if (inDouble && next === '"') {
        current += '""';
        i += 1;
        continue;
      }
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (!dollarTag && ch === '$') {
        const rest = sql.slice(i);
        const tagMatch = rest.match(/^\$([A-Za-z0-9_]*)\$/);
        if (tagMatch) {
          dollarTag = tagMatch[0];
          current += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      } else if (dollarTag && sql.slice(i, i + dollarTag.length) === dollarTag) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
    }

    if (!inSingle && !inDouble && !dollarTag && ch === ';') {
      const trimmed = stripSqlComments(current).trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = stripSqlComments(current).trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

/**
 * @throws {Error}
 */
export function assertReadOnlySql(sql) {
  if (!sql || !sql.trim()) {
    throw new Error('SQL vuoto non consentito');
  }

  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new Error('SQL vuoto non consentito');
  }

  for (const statement of statements) {
    const cleaned = stripSqlComments(statement).trim();
    if (!cleaned) continue;

    if (FORBIDDEN_KEYWORD.test(cleaned)) {
      throw new Error(
        'Query non consentita: sono permesse solo SELECT, WITH ed EXPLAIN in sola lettura',
      );
    }

    if (!ALLOWED_START.test(cleaned)) {
      throw new Error(
        'Query non consentita: la query deve iniziare con SELECT, WITH o EXPLAIN',
      );
    }
  }
}

function truncateOutput(output) {
  if (output.length <= MAX_OUTPUT_CHARS) return output;

  const rowMatches = [...output.matchAll(/^[│├└┌].*$/gm)];
  if (rowMatches.length > MAX_ROWS_HINT) {
    const lines = output.split('\n');
    let dataRows = 0;
    const kept = [];
    for (const line of lines) {
      kept.push(line);
      if (/^[│├└┌]/.test(line) && !line.includes('═') && !line.includes('─')) {
        dataRows += 1;
        if (dataRows >= MAX_ROWS_HINT) {
          kept.push(`\n… output troncato (${MAX_ROWS_HINT}+ righe, ${output.length} caratteri totali)`);
          return kept.join('\n');
        }
      }
    }
  }

  return `${output.slice(0, MAX_OUTPUT_CHARS)}\n… output troncato (${output.length} caratteri totali)`;
}

function runCli(args, options = {}) {
  const cli = resolvePostgresCli();
  const projectRoot = resolveProjectRoot();
  const profile = resolveDbProfile();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, {
      env: {
        ...process.env,
        DB_PROJECT_ROOT: projectRoot,
        DB_PROFILE: profile,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Postgres CLI timeout dopo ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    if (options.stdin) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

export async function profileTest() {
  if (usePgDriver() && sharedPg) {
    return pgProfileTest(sharedPg);
  }
  const { stdout, stderr, exitCode } = await runCli(['profile', 'test']);
  const output = (stdout + stderr).trim();
  if (exitCode !== 0) {
    throw new Error(output || 'Connessione al database fallita');
  }
  return output;
}

/**
 * Elenco tabelle (output compatto per il modello).
 */
export async function listTables() {
  if (usePgDriver() && sharedPg) {
    return truncateForModel(await pgListTables(sharedPg));
  }
  const { stdout, stderr, exitCode } = await runCli(['schema', 'list', 'tables']);
  const output = truncateForModel((stdout + stderr).trim());
  if (exitCode !== 0) {
    throw new Error(output || 'schema list tables fallito');
  }
  return output;
}

export function truncateForModel(text, maxChars = TOOL_RESULT_MAX_CHARS) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n… (troncato per il modello: ${text.length} caratteri totali)`;
}

export async function schemaInspect(options = {}) {
  const now = Date.now();
  if (!options.force && schemaCache.data && schemaCache.expiresAt > now) {
    return schemaCache.data;
  }

  if (usePgDriver() && sharedPg) {
    const output = truncateForModel(await pgSchemaInspect(sharedPg), 4000);
    schemaCache.data = output;
    schemaCache.expiresAt = now + SCHEMA_CACHE_TTL_MS;
    return output;
  }

  const { stdout, stderr, exitCode } = await runCli(['schema', 'inspect']);
  const output = truncateForModel(truncateOutput((stdout + stderr).trim()), 4000);
  if (exitCode !== 0) {
    throw new Error(output || 'schema inspect fallito');
  }

  schemaCache.data = output;
  schemaCache.expiresAt = now + SCHEMA_CACHE_TTL_MS;
  return output;
}

export async function findObjects(pattern, types) {
  if (usePgDriver() && sharedPg) {
    return truncateForModel(await pgFindObjects(sharedPg, pattern, types));
  }
  const args = ['query', 'find', pattern];
  if (types) args.push('--types', types);

  const { stdout, stderr, exitCode } = await runCli(args);
  const output = truncateForModel(truncateOutput((stdout + stderr).trim()));
  if (exitCode !== 0) {
    throw new Error(output || 'query find fallito');
  }
  return output;
}

export async function runQuery(sql) {
  assertReadOnlySql(sql);

  if (usePgDriver() && sharedPg) {
    const raw = await pgRunQuery(sharedPg, sql);
    return truncateForModel(raw);
  }

  const { stdout, stderr, exitCode } = await runCli(['query', 'run'], { stdin: sql });
  const raw = truncateOutput((stdout + stderr).trim());
  if (exitCode !== 0) {
    throw new Error(raw || 'query run fallito');
  }
  return truncateForModel(raw);
}

/** Invalidate cached schema summary. */
export function clearSchemaCache() {
  schemaCache.data = null;
  schemaCache.expiresAt = 0;
}
