// @ts-nocheck
import { runQuery } from './postgres-cli.js';

export type RecipeName =
  | 'same_horse_consecutive_cross_year'
  | 'wins_by_contrada'
  | 'last_win'
  | 'palio_participants';

export const RECIPE_NAMES = [
  'same_horse_consecutive_cross_year',
  'wins_by_contrada',
  'last_win',
  'palio_participants',
] as const satisfies readonly RecipeName[];

/** @deprecated Use RECIPE_NAMES — alias per compatibilità */
export const RECIPE_IDS = RECIPE_NAMES;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_CODE_RE = /^\d{9}$/;

/** Espressione SQL per etichetta fantino (soprannome preferito, altrimenti nome). */
export const FANTINO_LABEL_SQL = `CASE
  WHEN f.id IS NULL THEN NULL
  ELSE COALESCE(NULLIF(TRIM(f.soprannome), ''), NULLIF(TRIM(f.nome), ''))
END`;

function assertInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`Parametro "${label}" deve essere un intero`);
  }
  return n;
}

function assertString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Parametro "${label}" deve essere una stringa non vuota`);
  }
  return value.trim();
}

function assertDate(value, label) {
  const s = assertString(value, label);
  if (!DATE_RE.test(s)) {
    throw new Error(`Parametro "${label}" deve essere una data YYYY-MM-DD`);
  }
  return s;
}

function sqlQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function contradaFilter(params) {
  if (params.contrada_id != null) {
    return `c.id = ${assertInt(params.contrada_id, 'contrada_id')}`;
  }

  const raw = params.contrada ?? params.contrada_name;
  if (raw == null || raw === '') {
    throw new Error('Serve contrada (nome o id), contrada_id o contrada_name');
  }

  if (typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw.trim()))) {
    return `c.id = ${assertInt(raw, 'contrada')}`;
  }

  return `c.name ILIKE ${sqlQuote(assertString(raw, 'contrada'))}`;
}

function yearFilters(params) {
  const parts = [];
  if (params.yearFrom != null) {
    parts.push(
      `extract(year FROM p.data_palio)::int >= ${assertInt(params.yearFrom, 'yearFrom')}`,
    );
  }
  if (params.yearTo != null) {
    parts.push(
      `extract(year FROM p.data_palio)::int <= ${assertInt(params.yearTo, 'yearTo')}`,
    );
  }
  return parts.length ? `\n  AND ${parts.join('\n  AND ')}` : '';
}

const RECIPES: Record<
  RecipeName,
  {
    description: string;
    validate: (params: Record<string, unknown>) => void;
    buildSql: (params: Record<string, unknown>) => string;
  }
> = {
  same_horse_consecutive_cross_year: {
    description:
      'Stesso cavallo (cavallo_id) per la stessa contrada in due palii consecutivi (data_palio, id) con anni diversi',
    validate() {},
    buildSql: () => `
WITH palii_ord AS (
  SELECT
    id,
    data_palio,
    source_code,
    straordinario,
    extract(month FROM data_palio)::int AS mese,
    extract(year FROM data_palio)::int AS anno,
    row_number() OVER (ORDER BY data_palio, id) AS edizione_seq
  FROM palii
),
partecipazioni AS (
  SELECT
    pp.contrada_id,
    pp.cavallo_id,
    po.data_palio,
    po.source_code,
    po.straordinario,
    po.mese,
    po.anno,
    po.edizione_seq
  FROM palio_partecipazioni pp
  JOIN palii_ord po ON po.id = pp.palio_id
  WHERE NOT pp.non_partecipa
    AND pp.cavallo_id IS NOT NULL
)
SELECT
  c.name AS contrada,
  cav.nome AS cavallo,
  prev.data_palio AS palio_precedente,
  prev.source_code AS codice_palio_precedente,
  prev.anno AS anno_precedente,
  curr.data_palio AS palio_successivo,
  curr.source_code AS codice_palio_successivo,
  curr.anno AS anno_successivo
FROM partecipazioni curr
JOIN partecipazioni prev
  ON prev.contrada_id = curr.contrada_id
 AND prev.edizione_seq = curr.edizione_seq - 1
 AND prev.cavallo_id = curr.cavallo_id
JOIN contrade c ON c.id = curr.contrada_id
JOIN cavalli cav ON cav.id = curr.cavallo_id
WHERE prev.anno <> curr.anno
ORDER BY curr.data_palio, c.name
`.trim(),
  },

  wins_by_contrada: {
    description: 'Palii vinti da una contrada, opzionalmente filtrati per intervallo anni',
    validate(params) {
      contradaFilter(params);
    },
    buildSql(params) {
      return `
SELECT
  p.data_palio,
  p.source_code,
  p.straordinario,
  c.name AS contrada
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
WHERE pp.vincitrice
  AND ${contradaFilter(params)}${yearFilters(params)}
ORDER BY p.data_palio DESC, p.id DESC
`.trim();
    },
  },

  last_win: {
    description: 'Ultimo palio vinto da una contrada',
    validate(params) {
      contradaFilter(params);
    },
    buildSql(params) {
      return `
SELECT
  p.data_palio,
  p.source_code,
  p.straordinario,
  c.name AS contrada,
  ca.nome AS cavallo,
  ${FANTINO_LABEL_SQL} AS fantino,
  f.nome AS fantino_nome,
  f.soprannome AS fantino_soprannome
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
LEFT JOIN fantini f ON f.id = pp.fantino_id
WHERE pp.vincitrice
  AND ${contradaFilter(params)}
ORDER BY p.data_palio DESC, p.id DESC
LIMIT 1
`.trim();
    },
  },

  palio_participants: {
    description: 'Partecipanti di un palio per source_code o data_palio',
    validate(params) {
      const hasCode = params.source_code != null && String(params.source_code).trim() !== '';
      const hasDate = params.data_palio != null && String(params.data_palio).trim() !== '';
      if (!hasCode && !hasDate) {
        throw new Error('Serve source_code o data_palio');
      }
      if (hasCode) {
        const code = assertString(params.source_code, 'source_code');
        if (!SOURCE_CODE_RE.test(code)) {
          throw new Error('source_code deve essere 9 cifre (es. 202507020)');
        }
      }
      if (hasDate) {
        assertDate(String(params.data_palio), 'data_palio');
      }
    },
    buildSql(params) {
      const filters = [];
      if (params.source_code != null && String(params.source_code).trim() !== '') {
        filters.push(`p.source_code = ${sqlQuote(assertString(params.source_code, 'source_code'))}`);
      }
      if (params.data_palio != null && String(params.data_palio).trim() !== '') {
        filters.push(`p.data_palio = ${sqlQuote(assertDate(String(params.data_palio), 'data_palio'))}::date`);
      }
      return `
SELECT
  c.name AS contrada,
  pp.canape,
  pp.ordine,
  pp.estratta,
  ec.name AS estratta_da,
  pp.non_partecipa,
  pp.vincitrice,
  ca.nome AS cavallo,
  ${FANTINO_LABEL_SQL} AS fantino,
  f.nome AS fantino_nome,
  f.soprannome AS fantino_soprannome,
  pp.ordine_arrivo
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
LEFT JOIN contrade ec ON ec.id = pp.estratta_da_id
LEFT JOIN cavalli ca ON ca.id = pp.cavallo_id
LEFT JOIN fantini f ON f.id = pp.fantino_id
WHERE ${filters.join(' AND ')}
ORDER BY pp.ordine NULLS LAST, pp.canape NULLS LAST, c.name
`.trim();
    },
  },
};

/**
 * Normalizza alias snake_case dal tool schema verso nomi interni.
 */
function normalizeParams(params) {
  const out = { ...params };
  if (out.year_from != null && out.yearFrom == null) {
    out.yearFrom = out.year_from;
  }
  if (out.year_to != null && out.yearTo == null) {
    out.yearTo = out.year_to;
  }
  return out;
}

export function validateRecipeParams(recipe, params = {}) {
  const normalized = normalizeParams(params ?? {});
  if (!RECIPE_NAMES.includes((recipe))) {
    throw new Error(
      `Ricetta sconosciuta: ${recipe}. Valide: ${RECIPE_NAMES.join(', ')}`,
    );
  }
  RECIPES[(recipe)].validate(normalized);
}

export function buildRecipeSql(recipe, params = {}) {
  const normalized = normalizeParams(params ?? {});
  validateRecipeParams(recipe, normalized);
  return RECIPES[(recipe)].buildSql(normalized);
}

export async function runPalioRecipe(recipe, params = {}) {
  const sql = buildRecipeSql(recipe, params);
  return runQuery(sql);
}

export function listRecipes() {
  return RECIPE_NAMES.map((name) => ({
    name,
    description: RECIPES[name].description,
  }));
}
