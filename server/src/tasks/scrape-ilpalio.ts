#!/usr/bin/env node
// @ts-nocheck
import pg from 'pg';
import { loadPgConfig } from '../lib/db-config.js';
import { fetchHtml, sleep } from '../lib/https-requests.js';
import {
  assegnazioneCavalliUrl,
  dirigenzeUrl,
  ingressoCanapeUrl,
  isEstrattaDaSindaco,
  normalizeContradaCode,
  ordineArrivoUrl,
  ordineEstrazioneUrl,
  parseAssegnazioneCavalli,
  parseDirigenze,
  parseIngressoCanape,
  parseOrdineArrivo,
  parseOrdineEstrazione,
  parsePalioPage,
  prevPalioUrlFromHtml,
  sommarioUrl,
  sourceCodeFromUrl,
} from '../lib/ilpalio-parser.js';
import { nameFromCode } from '../lib/contrade-codes.js';
import {
  getOrCreateBarbaresco,
  getOrCreateCapitano,
  getOrCreateCavallo,
  getOrCreateFantino,
  getOrCreateMangini,
  getOrCreatePriore,
  loadContradeMap,
} from '../lib/entities.js';

const DEFAULT_START = ingressoCanapeUrl('202507020');

const HELP_TEXT = `Usage: node tasks/scrape-ilpalio.js [options]

Full import per Palio: sommario, ingresso-canape, dirigenze, ordine-estrazione,
assegnazione-cavalli, ordine-arrivo. Crawls backwards via "Palio precedente".

Options:
  --start URL              First ingresso-canape URL (default: ${DEFAULT_START})
  --source-code CODE       Shorthand for --start ingressoCanapeUrl(CODE); default --max 1
  --until-date YYYY-MM-DD  After a successful import, stop if data_palio < this date
  --max N                  Max Palii to fetch (default: 20, or 1 with --source-code alone)
  --delay-ms MS            Pause between HTTP requests (default: 800)
  --fail-fast              Stop on first fetch/parse/import error
  --help                   Show this help

Examples:
  node tasks/scrape-ilpalio.js --source-code 202507020
  node tasks/scrape-ilpalio.js --start https://www.ilpalio.siena.it/5/Palio/202508160/ingresso-canape \\
    --until-date 2025-07-01 --max 100 --delay-ms 800`;

function parseArgs(argv) {
  const opts = {
    start: DEFAULT_START,
    max: 20,
    delayMs: 800,
    failFast: false,
    untilDate: null,
  };
  let explicitMax = false;
  let usedSourceCode = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start' && argv[i + 1]) opts.start = argv[++i];
    else if (a === '--source-code' && argv[i + 1]) {
      opts.start = ingressoCanapeUrl(argv[++i]);
      usedSourceCode = true;
    } else if (a === '--until-date' && argv[i + 1]) opts.untilDate = argv[++i];
    else if (a === '--max' && argv[i + 1]) {
      opts.max = Number(argv[++i]);
      explicitMax = true;
    } else if (a === '--delay-ms' && argv[i + 1]) opts.delayMs = Number(argv[++i]);
    else if (a === '--fail-fast') opts.failFast = true;
    else if (a === '--help') {
      console.log(HELP_TEXT);
      process.exit(0);
    }
  }
  if (usedSourceCode && !explicitMax) opts.max = 1;
  return opts;
}

function normalizeStartUrl(url) {
  const code = sourceCodeFromUrl(url);
  if (!String(url).includes('ingresso-canape')) {
    return ingressoCanapeUrl(code);
  }
  return url;
}

async function persistPalio(
  client,
  sommario,
  canapeRows,
  contradeByName,
  ordineByCode,
  assegnazioneByCode,
  arrivoByCode,
  dirigenzeByCode,
) {
  if (!sommario.vincitrice) {
    throw new Error('No winner row to import');
  }

  const winnerCode = sommario.vincitrice.contradaCode;

  const upsert = await client.query(
    `INSERT INTO palii (source_code, data_palio, straordinario)
     VALUES ($1, $2::date, $3)
     ON CONFLICT (source_code) DO UPDATE
       SET data_palio = EXCLUDED.data_palio,
           straordinario = EXCLUDED.straordinario
     RETURNING id`,
    [sommario.sourceCode, sommario.dataPalio, sommario.straordinario],
  );
  const palioId = upsert.rows[0].id;

  await client.query(
    `DELETE FROM palio_partecipazione_mangini
     WHERE partecipazione_id IN (SELECT id FROM palio_partecipazioni WHERE palio_id = $1)`,
    [palioId],
  );
  await client.query('DELETE FROM palio_partecipazioni WHERE palio_id = $1', [palioId]);

  const v = sommario.vincitrice;

  let partecipazioni = 0;

  for (const row of canapeRows) {
    const contradaName = row.contradaName || nameFromCode(row.contradaCode);
    const contradaId = contradeByName.get(contradaName);
    if (!contradaId) {
      throw new Error(`Contrada not in DB: ${contradaName}`);
    }

    const isWinner = row.contradaCode === winnerCode;
    const nonPartecipa = Boolean(row.nonPartecipa);

    let cavalloId = null;
    let fantinoId = null;
    if (!nonPartecipa && row.cavallo?.sourceId) {
      cavalloId = await getOrCreateCavallo(client, {
        sourceId: row.cavallo.sourceId,
        nome: row.cavallo.nome,
      });
    }
    if (!nonPartecipa && row.fantino?.sourceId) {
      const sop = row.fantino.soprannome || '';
      fantinoId = await getOrCreateFantino(
        client,
        {
          sourceId: row.fantino.sourceId,
          nome: sop,
          soprannome: sop,
        },
        { fullNome: false },
      );
    }

    if (!nonPartecipa && isWinner && v.fantino?.sourceId) {
      fantinoId = await getOrCreateFantino(
        client,
        {
          sourceId: v.fantino.sourceId,
          nome: v.fantino.nome || v.fantino.soprannome || row.fantino?.soprannome || '',
          soprannome: v.fantino.soprannome || row.fantino?.soprannome,
        },
        { fullNome: true },
      );
    }

    let ordine = null;
    let estratta = false;
    let estrattaDaId = null;
    const codeKey = normalizeContradaCode(row.contradaCode);
    if (ordineByCode?.size) {
      const extr = ordineByCode.get(codeKey);
      if (!extr) {
        process.stderr.write(
          `WARN: no ordine-estrazione match for ${row.contradaCode} (${contradaName})\n`,
        );
      } else {
        ordine = extr.ordine;
        estratta = extr.estratta;
        if (extr.estrattaDaName && !isEstrattaDaSindaco(extr.estrattaDaName)) {
          estrattaDaId = contradeByName.get(extr.estrattaDaName) ?? null;
          if (!estrattaDaId) {
            process.stderr.write(
              `WARN: unknown estratta da contrada "${extr.estrattaDaName}" for ${contradaName}\n`,
            );
          }
        }
      }
    }

    let ordineAssegnazione = null;
    let orecchio = null;
    let coscia = null;
    let proprietarioCavallo = null;
    let cavalloPresoDa = null;
    if (!nonPartecipa && assegnazioneByCode?.size) {
      const asg = assegnazioneByCode.get(codeKey);
      if (!asg) {
        process.stderr.write(
          `WARN: no assegnazione-cavalli match for ${row.contradaCode} (${contradaName})\n`,
        );
      } else {
        ordineAssegnazione = asg.ordineAssegnazione;
        orecchio = asg.orecchio;
        coscia = asg.coscia;
        proprietarioCavallo = asg.proprietarioCavallo;
        cavalloPresoDa = asg.cavalloPresoDa;
      }
    }

    let ordineArrivo = null;
    if (!nonPartecipa && arrivoByCode?.size) {
      const pos = arrivoByCode.get(codeKey);
      if (pos == null) {
        process.stderr.write(
          `WARN: no ordine-arrivo match for ${row.contradaCode} (${contradaName})\n`,
        );
      } else {
        ordineArrivo = pos;
      }
    }

    const dirigenza = dirigenzeByCode?.get(codeKey);
    if (dirigenzeByCode?.size && !dirigenza) {
      process.stderr.write(
        `WARN: no dirigenze match for ${row.contradaCode} (${contradaName})\n`,
      );
    }

    let capitanoId = null;
    let prioreId = null;
    let barbarescoId = null;
    if (dirigenza?.capitano) capitanoId = await getOrCreateCapitano(client, dirigenza.capitano);
    if (dirigenza?.priore) prioreId = await getOrCreatePriore(client, dirigenza.priore);
    if (dirigenza?.barbaresco) barbarescoId = await getOrCreateBarbaresco(client, dirigenza.barbaresco);

    const ins = await client.query(
      `INSERT INTO palio_partecipazioni (
         palio_id, contrada_id, vincitrice, non_partecipa, canape,
         ordine, estratta, estratta_da_id,
         ordine_assegnazione, orecchio, coscia, proprietario_cavallo, cavallo_preso_da,
         ordine_arrivo,
         cavallo_id, fantino_id, capitano_id, priore_id, barbaresco_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id`,
      [
        palioId,
        contradaId,
        isWinner,
        nonPartecipa,
        nonPartecipa ? null : row.canape,
        ordine,
        estratta,
        estrattaDaId,
        nonPartecipa ? null : ordineAssegnazione,
        nonPartecipa ? null : orecchio,
        nonPartecipa ? null : coscia,
        nonPartecipa ? null : proprietarioCavallo,
        nonPartecipa ? null : cavalloPresoDa,
        nonPartecipa ? null : ordineArrivo,
        nonPartecipa ? null : cavalloId,
        nonPartecipa ? null : fantinoId,
        capitanoId,
        prioreId,
        barbarescoId,
      ],
    );
    partecipazioni++;

    const mangini = dirigenza?.mangini ?? [];
    for (let i = 0; i < mangini.length; i++) {
      const manginiId = await getOrCreateMangini(client, mangini[i]);
      await client.query(
        `INSERT INTO palio_partecipazione_mangini (partecipazione_id, mangini_id, ordine)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [ins.rows[0].id, manginiId, i],
      );
    }
  }

  return { palioId, partecipazioni };
}

async function main() {
  const opts = parseArgs(process.argv);
  const pgConfig = loadPgConfig();
  const pool = new pg.Pool(pgConfig.connectionString ? { connectionString: pgConfig.connectionString } : pgConfig);

  let url = normalizeStartUrl(opts.start);
  let count = 0;
  const errors = [];

  const client = await pool.connect();
  try {
    const contradeByName = await loadContradeMap(client);

    let fetched = 0;
    while (url && fetched < opts.max) {
      const code = sourceCodeFromUrl(url);
      process.stderr.write(`[${fetched + 1}/${opts.max}] ${code} … `);

      let canapeHtml;
      try {
        canapeHtml = await fetchHtml(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`FETCH FAIL (canape): ${msg}`);
        errors.push({ code, msg });
        if (opts.failFast) throw err;
        break;
      }

      await sleep(opts.delayMs);

      const summaryUrl = sommarioUrl(code);
      let sommarioHtml;
      try {
        sommarioHtml = await fetchHtml(summaryUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`FETCH FAIL (sommario): ${msg}`);
        errors.push({ code, msg });
        if (opts.failFast) throw err;
        url = prevPalioUrlFromHtml(canapeHtml);
        fetched++;
        if (url && fetched < opts.max) await sleep(opts.delayMs);
        continue;
      }

      fetched++;

      let sommario;
      try {
        sommario = parsePalioPage(sommarioHtml, summaryUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`SKIP (sommario): ${msg}`);
        errors.push({ code, msg });
        url = prevPalioUrlFromHtml(canapeHtml);
        if (url && fetched < opts.max) await sleep(opts.delayMs);
        continue;
      }

      let canapeRows;
      try {
        canapeRows = parseIngressoCanape(canapeHtml);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`SKIP (canape): ${msg}`);
        errors.push({ code, msg });
        url = prevPalioUrlFromHtml(canapeHtml);
        if (url && fetched < opts.max) await sleep(opts.delayMs);
        continue;
      }

      await sleep(opts.delayMs);

      const dirigenzePageUrl = dirigenzeUrl(code);
      let dirigenzeByCode: Map<
        string,
        { capitano?: string; priore?: string; barbaresco?: string; mangini: string[] }
      > | null = null;
      try {
        const dirigenzeHtml = await fetchHtml(dirigenzePageUrl);
        dirigenzeByCode = parseDirigenze(dirigenzeHtml);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`WARN (dirigenze): ${msg}`);
        if (opts.failFast) throw err;
      }

      await sleep(opts.delayMs);

      const estrazioneUrl = ordineEstrazioneUrl(code);
      let ordineByCode: Map<
        string,
        { ordine: number; estratta: boolean; estrattaDaName?: string }
      > | null = null;
      try {
        const estrazioneHtml = await fetchHtml(estrazioneUrl);
        ordineByCode = parseOrdineEstrazione(estrazioneHtml);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`WARN (ordine-estrazione): ${msg}`);
        if (opts.failFast) throw err;
      }

      await sleep(opts.delayMs);

      const assegnazioneUrl = assegnazioneCavalliUrl(code);
      let assegnazioneByCode: Map<
        string,
        {
          ordineAssegnazione: number;
          orecchio: number;
          coscia: number;
          proprietarioCavallo: string;
          cavalloPresoDa: string;
        }
      > | null = null;
      try {
        const assegnazioneHtml = await fetchHtml(assegnazioneUrl);
        assegnazioneByCode = parseAssegnazioneCavalli(assegnazioneHtml);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`WARN (assegnazione-cavalli): ${msg}`);
        if (opts.failFast) throw err;
      }

      await sleep(opts.delayMs);

      const arrivoUrl = ordineArrivoUrl(code);
            let arrivoByCode: Map<string, number>|null = null;
      try {
        const arrivoHtml = await fetchHtml(arrivoUrl);
        arrivoByCode = parseOrdineArrivo(arrivoHtml);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`WARN (ordine-arrivo): ${msg}`);
        if (opts.failFast) throw err;
      }

      try {
        await client.query('BEGIN');
        const { partecipazioni } = await persistPalio(
          client,
          sommario,
          canapeRows,
          contradeByName,
          ordineByCode,
          assegnazioneByCode,
          arrivoByCode,
          dirigenzeByCode,
        );
        await client.query('COMMIT');
        console.error(`ok (${partecipazioni} partecipazioni)`);
        count++;
        if (opts.untilDate && sommario.dataPalio < opts.untilDate) {
          url = null;
        } else {
          url = prevPalioUrlFromHtml(canapeHtml);
        }
        if (url && fetched < opts.max) await sleep(opts.delayMs);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`SKIP (import): ${msg}`);
        errors.push({ code, msg });
        if (opts.failFast) throw err;
        url = prevPalioUrlFromHtml(canapeHtml);
        if (url && fetched < opts.max) await sleep(opts.delayMs);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify({ imported: count, errors }, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
