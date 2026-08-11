---
name: scrape-ilpalio
description: >-
  Runs full Palio imports from ilpalio.siena.it (eight pages per Palio: sommario,
  ingresso-canape, dirigenze, ordine-estrazione, assegnazione-cavalli,
  ordine-arrivo, cadute, prove) via server/src/tasks/scrape-ilpalio.ts. Use when the user asks to
  scrape, import, sync, or backfill Palio data; run a single Palio by source
  code; crawl a date range backwards; or refresh data from ilpalio.siena.it.
---

# Scrape ilpalio.siena.it

Import complete Palio records into Postgres using `server/src/tasks/scrape-ilpalio.ts`. Each Palio triggers **eight HTTP requests** then a DB transaction.

## Prerequisites

1. **Node deps** (from repo root):
   ```bash
   cd server && npm install
   ```
2. **Schema**: apply [`db/migrations/prerelease.sql`](../../../db/migrations/prerelease.sql) (see root README).
3. **Database**: `.skills/postgres/config.toml` profile `local`, or `DATABASE_URL` in the environment.

Optional wrapper (from repo root):
```bash
chmod +x .cursor/skills/scrape-ilpalio/scripts/scrape.sh
```

## Single Palio (full scrape)

By **source code** (default `--max 1`):

```bash
cd server
npx tsx src/tasks/scrape-ilpalio.js --source-code 202507020
```

By **URL** (normalize to ingresso-canape if needed):

```bash
cd server
npx tsx src/tasks/scrape-ilpalio.js \
  --start https://www.ilpalio.siena.it/5/Palio/202507020/ingresso-canape \
  --max 1
```

Wrapper:

```bash
.cursor/skills/scrape-ilpalio/scripts/scrape.sh --palio 202507020
```

## Date range (backwards crawl)

Crawl starts at the **newest** Palio in the range (`--start` or `--source-code` / `--end-code` in the wrapper). After each successful import, the scraper follows «Palio precedente» until `data_palio < --until-date` or `--max` is reached.

**Lower bound** = `--until-date` (exclusive stop: last imported Palio may be the first with `data_palio` strictly before this date).

Example: from August 2025 back through July 2025 (stop before 2025-07-01):

```bash
cd server
npx tsx src/tasks/scrape-ilpalio.js \
  --start https://www.ilpalio.siena.it/5/Palio/202508160/ingresso-canape \
  --until-date 2025-07-01 \
  --max 100 \
  --delay-ms 800
```

Same with source code:

```bash
cd server
npx tsx src/tasks/scrape-ilpalio.js \
  --source-code 202508160 \
  --until-date 2025-07-01 \
  --max 100 \
  --delay-ms 800
```

Wrapper (`--to` documents the intended upper bound; crawl start is `--end-code`):

```bash
.cursor/skills/scrape-ilpalio/scripts/scrape.sh \
  --from 2025-07-01 --to 2025-08-16 --end-code 202508160
```

Pick `--end-code` / start URL from the most recent Palio in the range on [ilpalio.siena.it](https://www.ilpalio.siena.it/). Set `--max` high enough to cover the number of Palii in the span (roughly twice per year plus straordinari).

## CLI reference

| Flag | Purpose |
|------|---------|
| `--source-code CODE` | `ingressoCanapeUrl(CODE)`; alone implies `--max 1` |
| `--start URL` | First ingresso-canape page |
| `--until-date YYYY-MM-DD` | Stop crawling after import when `data_palio` &lt; date |
| `--max N` | Max Palii to attempt (default 20; 1 with `--source-code` only) |
| `--delay-ms MS` | Pause between requests (default **800**; keep ≥500 to be polite) |
| `--fail-fast` | Abort on first fetch/parse/import error |

Help: `npx tsx src/tasks/scrape-ilpalio.js --help`

## Operational guidance

- Prefer **`--delay-ms 800`** (or higher) for production backfills; avoid hammering ilpalio.siena.it.
- Use **`--fail-fast`** when debugging a single Palio; omit for long backfills so one bad page does not stop the run.
- stderr logs progress; stdout ends with JSON `{ "imported": N, "errors": [...] }`. Exit code 1 if any errors were recorded.
- On skip paths (sommario/canape), the crawl still advances via «Palio precedente» when possible.

## Post-run validation

Set up Postgres CLI (from repo root):

```bash
export DB_PROJECT_ROOT="$PWD"
export POSTGRES_CLI="$HOME/.agents/skills/postgres/scripts/postgres"
export DB_PROFILE=local
```

Count imported Palii:

```bash
"$POSTGRES_CLI" query run -c "SELECT COUNT(*) AS palii FROM palii;"
```

Sample partecipazioni with staff for a known code:

```bash
"$POSTGRES_CLI" query run -c "
SELECT p.source_code, p.data_palio, c.name,
       pp.canape, pp.ordine_arrivo,
       cap.nome AS capitano, pri.nome AS priore
FROM palii p
JOIN palio_partecipazioni pp ON pp.palio_id = p.id
JOIN contrade c ON c.id = pp.contrada_id
LEFT JOIN capitani cap ON cap.id = pp.capitano_id
LEFT JOIN priori pri ON pri.id = pp.priore_id
WHERE p.source_code = '202507020'
ORDER BY pp.canape NULLS LAST;
"
```

## Rivalità contrade (task separato)

Non fa parte del crawl Palio. Importa i periodi di rivalità da
`/5/Contrade/{CODE}?rivalita&lang=it` (17 contrade) in `contrada_rivalita`.

Prerequisito: migration [`db/migrations/contrada_rivalita.sql`](../../../db/migrations/contrada_rivalita.sql).

```bash
cd server
npm run scrape:rivalita
# oppure: npx tsx src/tasks/scrape-contrade-rivalita.ts --delay-ms 800
```

Idempotente (`DELETE` + reinsert). Default `--delay-ms 800`.

Validazione:

```bash
"$POSTGRES_CLI" query run -c "
SELECT c1.name AS contrada, c2.name AS rivale, r.data_inizio, r.data_fine
FROM contrada_rivalita r
JOIN contrade c1 ON c1.id = r.contrada_id
JOIN contrade c2 ON c2.id = r.rivale_id
ORDER BY c1.name, c2.name, r.data_inizio NULLS FIRST;
"
```

## Agent workflow

1. Confirm DB migration and `cd server && npm install`.
2. Choose single-Palio (`--source-code`) vs range (`--start`/`--source-code` + `--until-date` + `--max`).
3. Run scraper; inspect stderr and final JSON.
4. Run validation SQL; report counts and any `errors` array entries.
5. Per rivalità: applicare `contrada_rivalita.sql` poi `npm run scrape:rivalita`.
