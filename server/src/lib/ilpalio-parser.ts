// @ts-nocheck
import * as cheerio from 'cheerio';
import { nameFromCode } from './contrade-codes.js';

const BASE = 'https://www.ilpalio.siena.it';

export function sommarioUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}`;
}

export function ingressoCanapeUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/ingresso-canape`;
}

export function ordineEstrazioneUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/ordine-estrazione`;
}

export function assegnazioneCavalliUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/assegnazione-cavalli`;
}

export function ordineArrivoUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/ordine-arrivo`;
}

export function caduteUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/cadute`;
}

export function proveUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/prove`;
}

export function dirigenzeUrl(sourceCode) {
  return `${BASE}/5/Palio/${sourceCode}/dirigenze`;
}

/** Pagina alleanze/rivalità di una contrada (code AQ… o nome Aquila). */
export function rivalitaUrl(codeOrName) {
  const slug = String(codeOrName || '').trim();
  if (!slug) throw new Error('rivalitaUrl: missing contrada code or name');
  return `${BASE}/5/Contrade/${encodeURIComponent(slug)}?rivalita&lang=it`;
}

/**
 * Precisione annuale dal sito → date ISO.
 * @returns {{ dataInizio: string|null, dataFine: string|null }[]}
 */
export function parseRivalitaYearText(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const periods = [];
  const chunks = raw.split(/\bpoi\b/i);
  for (const chunk of chunks) {
    const dalAl = chunk.match(/dal\s+(\d{4})\s+al\s+(\d{4})/i);
    if (dalAl) {
      periods.push({
        dataInizio: `${dalAl[1]}-01-01`,
        dataFine: `${dalAl[2]}-12-31`,
      });
      continue;
    }
    const fino = chunk.match(/fino\s+al\s+(\d{4})/i);
    if (fino) {
      periods.push({
        dataInizio: null,
        dataFine: `${fino[1]}-12-31`,
      });
      continue;
    }
    const dal = chunk.match(/dal\s+(\d{4})/i);
    if (dal) {
      periods.push({
        dataInizio: `${dal[1]}-01-01`,
        dataFine: null,
      });
    }
  }
  return periods;
}

/**
 * Solo blocco InfoBox «Rivalità» (ignora Alleanze e narrazione).
 * @returns {{ rivaleCode: string, dataInizio: string|null, dataFine: string|null }[]}
 */
export function parseRivalita(html) {
  const $ = cheerio.load(html);
  const box = $('.Corniciato.InfoBox')
    .filter((_, el) => {
      const title = $(el).find('.Grande').first().text().replace(/\s+/g, '');
      return /Rivalit/i.test(title);
    })
    .first();

  if (!box.length) return [];

  const results = [];
  const $p = box.find('p').first();
  const nodes = $p.contents().toArray();

  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (node.type === 'tag' && node.name === 'a') {
      const href = $(node).attr('href') || '';
      const m = href.match(/\/Contrade\/([A-Za-z]+)/i);
      if (m) {
        const rivaleCode = normalizeContradaCode(m[1]);
        let periodText = '';
        let j = i + 1;
        while (j < nodes.length) {
          const n = nodes[j];
          if (n.type === 'tag' && n.name === 'br') break;
          if (n.type === 'tag' && n.name === 'a') {
            const h = $(n).attr('href') || '';
            if (/\/Contrade\//i.test(h)) break;
            periodText += $(n).text();
          } else if (n.type === 'text') {
            periodText += n.data || '';
          } else if (n.type === 'tag') {
            periodText += $(n).text();
          }
          j += 1;
        }
        const periods = parseRivalitaYearText(periodText);
        if (periods.length === 0) {
          results.push({ rivaleCode, dataInizio: null, dataFine: null });
        } else {
          for (const p of periods) {
            results.push({
              rivaleCode,
              dataInizio: p.dataInizio,
              dataFine: p.dataFine,
            });
          }
        }
        i = j;
        continue;
      }
    }
    i += 1;
  }

  return results;
}

export function isEstrattaDaSindaco(label) {
  return /^sindaco$/i.test(String(label || '').trim());
}

export function normalizeContradaCode(code) {
  let c = String(code || '').trim().toUpperCase();
  if (c.startsWith('-')) c = c.slice(1);
  return c;
}

export function isNonPartecipaLabel(label) {
  const t = String(label || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  return t === 'N.P.' || t === 'N.P' || t === 'NP';
}

export function mapCanapeLabel(label) {
  if (isNonPartecipaLabel(label)) return null;
  const t = String(label || '').trim().toUpperCase();
  if (t === 'R') return 10;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= 9) return n;
  throw new Error(`Invalid canape label: ${label}`);
}

export function prevPalioUrlFromHtml(html) {
  const $ = cheerio.load(html);
  const prevHref = $('#lnkPalioPrecedente').attr('href');
  return prevHref ? new URL(prevHref, BASE).href : null;
}

export function sourceCodeFromUrl(urlOrPath) {
  const m = String(urlOrPath).match(/\/Palio\/(\d+)/i);
  if (!m) throw new Error(`Cannot extract source code from URL: ${urlOrPath}`);
  return m[1];
}

/**
 * Sommario Palio: metadata, winner staff, annullato skip.
 */
export function parsePalioPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const sourceCode = sourceCodeFromUrl(pageUrl);

  const dataPalio = $('h1.Titolo time').attr('datetime');
  if (!dataPalio) {
    throw new Error(`Missing data_palio (time@datetime) on ${sourceCode}`);
  }

  const h1Text = $('h1.Titolo').text().toLowerCase();
  const noteText = $('#divNoteSommario, #sec_Note').text().toLowerCase();
  const straordinario =
    /\bpalio\s+straordinari[oa]\b/.test(h1Text + noteText) ||
    /\bstraordinari[oa]\b/.test(h1Text);

  const combined = `${h1Text} ${noteText}`;
  const annullato =
    /\bpalio\s+(?:è\s+stato\s+)?annullat[oa]\b/i.test(combined) ||
    /\bannullat[oa]\s+il\s+palio\b/i.test(combined);
  if (annullato) {
    throw new Error('Palio annullato (skipped)');
  }

  const vincitrice = parseVintoDa($);
  if (!vincitrice) {
    throw new Error('Panel "Vinto da" not found');
  }

  return {
    sourceCode,
    dataPalio,
    straordinario,
    vincitrice,
  };
}

export function parseIngressoCanape(html) {
  const $ = cheerio.load(html);
    const out: ReturnType<typeof parseContradaBox>[] = [];

  $('.Canape .ContradaBox').each((_, el) => {
    const row = parseContradaBox($, $(el));
    if (row) out.push(row);
  });

  if (!out.length) {
    throw new Error('No ContradaBox rows on ingresso-canape page');
  }

  return out;
}

/**
 * Ordine di estrazione: blocco «Estrazione di …» (10 contrade al canape).
 */
export function parseOrdineEstrazione(html) {
  const $ = cheerio.load(html);
  const root = $('#sezPrincipale').length ? $('#sezPrincipale') : $('section').first();
  const out: Map<string, { ordine: number; estratta: boolean; estrattaDaName?: string }> = new Map();

  root.find('.Corniciato').each((_, cornEl) => {
    const corn = $(cornEl);
    const title = corn.find('h4').first().text().trim();
    const lower = title.toLowerCase();
    if (!/estrazione/i.test(lower) || /altre\s+sette/i.test(lower)) return;

    corn.find('.BandieraBox').each((__, boxEl) => {
      const box = $(boxEl);
      const ordineText = box.children('div').first().text().trim();
      const ordine = Number(ordineText);
      if (!Number.isInteger(ordine) || ordine < 1) return;

      const rawCode = extractOnclickCode(box, 'DC');
      if (!rawCode) return;
      const contradaCode = normalizeContradaCode(rawCode);

      const estrattaDaLabel = parseEstrattaDaName(box);
      const entry = { ordine, estratta: estrattaDaLabel !== null };
      if (estrattaDaLabel && !isEstrattaDaSindaco(estrattaDaLabel)) {
        entry.estrattaDaName = estrattaDaLabel;
      }
      out.set(contradaCode, entry);
    });
  });

  if (!out.size) {
    throw new Error('No BandieraBox rows in ordine-estrazione «Estrazione» section');
  }

  return out;
}

/**
 * Assegnazione cavalli (tratta): tabella in #sezPrincipale (.RigaTabCavalli).
 */
export function parseAssegnazioneCavalli(html) {
  const $ = cheerio.load(html);
  const root = $('#sezPrincipale').length ? $('#sezPrincipale') : $('section').first();
  const out: Map<
    string,
    {
      ordineAssegnazione: number;
      orecchio: number;
      coscia: number;
      proprietarioCavallo: string;
      /** Assente su alcune pagine recenti senza cella `name="PresoDa"`. */
      cavalloPresoDa: string | null;
    }
  > = new Map();

  root.find('.RigaTabCavalli:not(.IntestazioneTabCavalli)').each((_, rowEl) => {
    const row = $(rowEl);
    const cells = row.children('.CellaTabCavalli');
    if (!cells.length) return;

    const ordineText = cells.first().find('strong').first().text().trim();
    const ordineAssegnazione = Number(ordineText);
    if (!Number.isInteger(ordineAssegnazione) || ordineAssegnazione < 1) return;

    const cavalloBox = cells.first().find('.CavalloBox');
    const orecchio = parseNumeroCavallo(cavalloBox.find('.NumeriCavallo.Orecchio').first());
    const coscia = parseNumeroCavallo(cavalloBox.find('.NumeriCavallo.Coscia').first());
    if (orecchio == null || coscia == null) return;

    const contradaCell = cells.filter((__, c) => $(c).find('a[onclick*="DC("]').length).first();
    const rawCode = extractOnclickCode(contradaCell.find('a[onclick*="DC("]').first(), 'DC');
    if (!rawCode) return;
    const contradaCode = normalizeContradaCode(rawCode);

    let proprietarioCavallo = row.find('[name="Proprietario"]').first().text().trim();
    if (!proprietarioCavallo) {
      const mobileOwner = row.find('[name="Cavallo"] .Mobile').first().text().trim();
      const m = /^di\s+(.+)$/i.exec(mobileOwner);
      if (m) proprietarioCavallo = m[1].trim();
    }
    const presoDaEl = row.find('[name="PresoDa"]').first();
    const cavalloPresoDaRaw = (presoDaEl.find('a').first().text() || presoDaEl.text()).trim();
    const cavalloPresoDa = cavalloPresoDaRaw || null;
    if (!proprietarioCavallo) return;

    out.set(contradaCode, {
      ordineAssegnazione,
      orecchio,
      coscia,
      proprietarioCavallo,
      cavalloPresoDa,
    });
  });

  if (!out.size) {
    throw new Error('No RigaTabCavalli rows on assegnazione-cavalli page');
  }

  return out;
}

/**
 * Ordine di arrivo: `.ContradaBox` in #sezPrincipale (solo i piazzati elencati sul sito).
 */
export function parseOrdineArrivo(html) {
  const $ = cheerio.load(html);
  const root = $('#sezPrincipale').length ? $('#sezPrincipale') : $('section').first();
    const out: Map<string, number> = new Map();

  root.find('.ContradaBox').each((_, el) => {
    const box = $(el);
    const ordineArrivo = parseOrdineArrivoLabel(box.children('div').first().text());
    if (ordineArrivo == null) return;

    const rawCode = extractOnclickCode(box.find('a[onclick*="DC("]').first(), 'DC');
    if (!rawCode) return;
    out.set(normalizeContradaCode(rawCode), ordineArrivo);
  });

  if (!out.size) {
    throw new Error('No ContradaBox rows on ordine-arrivo page');
  }

  return out;
}

/** `Primo giro` → 1, `Secondo giro` → 2, `Terzo giro` → 3. */
function parseGiroCadutaLabel(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (/primo\s+giro/.test(t)) return 1;
  if (/secondo\s+giro/.test(t)) return 2;
  if (/terzo\s+giro/.test(t)) return 3;
  return null;
}

/**
 * Cadute per giro: sezioni `.Corniciato` con h4 Primo/Secondo/Terzo giro
 * e box `.ContradaCaduta .ContradaBox` (onclick DC).
 * Mappa code → giro (1–3); se duplicato, tiene il giro minore.
 */
export function parseCadute(html) {
  const $ = cheerio.load(html);
  const root = $('#sezPrincipale').length ? $('#sezPrincipale') : $('body');
  const out: Map<string, number> = new Map();

  root.find('section.Corniciato').each((_, el) => {
    const section = $(el);
    const giro = parseGiroCadutaLabel(section.find('h4').first().text());
    if (giro == null) return;

    section.find('.ContradaCaduta .ContradaBox').each((__, boxEl) => {
      const box = $(boxEl);
      const rawCode =
        extractOnclickCode(box.find('a[onclick*="DC("]').first(), 'DC') ||
        extractOnclickCode(box.find('[onclick*="DC("]').first(), 'DC');
      if (!rawCode) return;
      const code = normalizeContradaCode(rawCode);
      const prev = out.get(code);
      if (prev == null || giro < prev) out.set(code, giro);
    });
  });

  return out;
}

/** Normalizza etichetta prova da h4 (senza menu Ingresso/Ordine/Cadute). */
function parseProvaEtichetta(h4Text) {
  const t = String(h4Text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = t.split(/\s+Ingresso\s+al\s+canape/i)[0].trim();
  const head = cut.split(':')[0].trim();
  if (/^provaccia$/i.test(head)) return 'Provaccia';
  if (/^prova\s+generale$/i.test(head)) return 'Prova Generale';
  if (/^prima\s+prova$/i.test(head)) return 'Prima prova';
  if (/^seconda\s+prova$/i.test(head)) return 'Seconda prova';
  if (/^terza\s+prova$/i.test(head)) return 'Terza prova';
  if (/^quarta\s+prova$/i.test(head)) return 'Quarta prova';
  return head || null;
}

function normalizeFantinoLabel(raw) {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInvalidFantinoSourceId(sourceId) {
  if (sourceId == null || sourceId === '') return true;
  const s = String(sourceId).trim();
  return s === '-1' || s === '0' || !/^\d+$/.test(s);
}

/**
 * Prove: soli blocchi ingresso canape `div[data-icprova]` (0–5 → numero 1–6).
 * Ignora ordine arrivo / cadute delle prove. Nessun cavallo in output.
 */
export function parseProve(html) {
  const $ = cheerio.load(html);
  const root = $('#sezPrincipale').length ? $('#sezPrincipale') : $('body');
  const out = [];

  root.find('[data-icprova]').each((_, el) => {
    const block = $(el);
    const idx = Number(block.attr('data-icprova'));
    if (!Number.isInteger(idx) || idx < 0 || idx > 5) return;
    const numero = idx + 1;

    let etichetta = null;
    const titleSpan = root.find(`[data-titoloprova="${idx}"]`).first();
    if (titleSpan.length) {
      const h4 = titleSpan.closest('h4');
      etichetta = parseProvaEtichetta(h4.length ? h4.text() : titleSpan.parent().text());
    }
    if (!etichetta) {
      const defaults = [
        'Prima prova',
        'Seconda prova',
        'Terza prova',
        'Quarta prova',
        'Prova Generale',
        'Provaccia',
      ];
      etichetta = defaults[idx];
    }

    const rows = [];
    block.find('.ContradaBox').each((__, boxEl) => {
      const box = $(boxEl);
      const label = box.children('div').first().text().trim();
      if (!label || label.includes('{{')) return;

      const contradaLink = box.find('a[onclick*="DC("]').first();
      const rawCode = extractOnclickCode(contradaLink, 'DC');
      if (!rawCode) return;
      const contradaCode = normalizeContradaCode(rawCode);

      if (isNonPartecipaLabel(label)) {
        rows.push({
          contradaCode,
          canape: null,
          nonPartecipa: true,
          fantino: null,
        });
        return;
      }

      let canape;
      try {
        canape = mapCanapeLabel(label);
      } catch {
        return;
      }
      if (canape == null) return;

      const fantinoEl = box.find('[name="Fantino"]').first();
      const fantinoSourceId = extractOnclickCode(fantinoEl, 'DF');
      const fantinoLabel = normalizeFantinoLabel(fantinoEl.text());
      let fantino = null;
      if (
        !isInvalidFantinoSourceId(fantinoSourceId) &&
        fantinoLabel &&
        fantinoLabel !== '-'
      ) {
        fantino = { sourceId: String(fantinoSourceId).trim(), label: fantinoLabel };
      }

      rows.push({
        contradaCode,
        canape,
        nonPartecipa: false,
        fantino,
      });
    });

    if (rows.length) {
      out.push({ numero, etichetta, rows });
    }
  });

  out.sort((a, b) => a.numero - b.numero);
  return out;
}

/**
 * Dirigenze di Contrada: capitano, priore/governatore/rettore, mangini, barbaresco per contrada.
 */
export function parseDirigenze(html) {
  const $ = cheerio.load(html);
  const root = $('#sezPrincipale').length ? $('#sezPrincipale') : $('section').first();
  const out: Map<
    string,
    { capitano?: string; priore?: string; barbaresco?: string; mangini: string[] }
  > = new Map();

  root.find('.Corniciato.Riquadro').each((_, el) => {
    const box = $(el);
    const rawCode =
      extractOnclickCode(box.find('.OmbraBandiera').first(), 'DC') ||
      extractOnclickCode(box.find('[onclick*="DC("]').first(), 'DC');
    if (!rawCode) return;

    const contradaCode = normalizeContradaCode(rawCode);
    const content = box.find('div[style*="clear"]').first();
    if (!content.length) return;

    const staff = parseStaffParagraph(content);
    out.set(contradaCode, {
      capitano: staff.capitano ?? undefined,
      priore: staff.priore ?? undefined,
      barbaresco: staff.barbaresco ?? undefined,
      mangini: staff.mangini,
    });
  });

  if (!out.size) {
    throw new Error('No Corniciato Riquadro rows on dirigenze page');
  }

  return out;
}

function parseOrdineArrivoLabel(label) {
  const m = String(label || '')
    .trim()
    .match(/^(\d+)\s*°/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function parseNumeroCavallo(el) {
  const n = Number(String(el.text() || '').replace(/\s+/g, ''));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function parseEstrattaDaName(box) {
  const piccolo = box.find('.Piccolo6').first();
  if (!piccolo.length) return null;
  const html = piccolo.html() || '';
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const m = text.match(/estratta\s+da\s*\n?\s*(.+)/i);
  return m ? m[1].trim() : null;
}

function parseContradaBox($, box) {
  const label = box.children('div').first().text().trim();
  if (!label || label.includes('{{')) return null;

  const contradaLink = box.find('a[onclick*="DC("]').first();
  const contradaCode = extractOnclickCode(contradaLink, 'DC');
  if (!contradaCode) return null;

  const contradaName =
    box.find('.RigaOrdCanape.PrimaRiga').first().text().trim() || nameFromCode(contradaCode);
  if (contradaName.includes('{{')) return null;

  if (isNonPartecipaLabel(label)) {
    return {
      contradaCode,
      contradaName,
      nonPartecipa: true,
      canape: null,
      cavallo: null,
      fantino: null,
      vincitriceDaCanape: false,
    };
  }

  let canape;
  try {
    canape = mapCanapeLabel(label);
  } catch {
    return null;
  }
  if (canape == null) return null;

  const cavalloEl = box.find('[name="Cavallo"]').first();
  const fantinoEl = box.find('[name="Fantino"]').first();
  const cavalloSourceId = extractOnclickCode(cavalloEl, 'DE');
  const fantinoSourceId = extractOnclickCode(fantinoEl, 'DF');
  const cavalloNome = cavalloEl.text().trim();
  const fantinoSoprannome = fantinoEl.text().trim();

  const vincitriceDaCanape =
    fantinoEl.hasClass('VV') ||
    box.find('.VV').length > 0 ||
    box.css('background-color')?.includes('green');

  return {
    contradaCode,
    contradaName,
    canape,
    cavallo: cavalloSourceId ? { sourceId: cavalloSourceId, nome: cavalloNome } : null,
    fantino: fantinoSourceId
      ? { sourceId: fantinoSourceId, soprannome: fantinoSoprannome }
      : null,
    vincitriceDaCanape,
  };
}

function findCorniciatoByHeading($, heading) {
  let found = null;
  $('.Corniciato').each((_, el) => {
    const h = $(el).find('h4').first().text().trim();
    if (h.toLowerCase() === heading.toLowerCase()) {
      found = $(el);
      return false;
    }
    return undefined;
  });
  return found;
}

function parseVintoDa($) {
  const box = findCorniciatoByHeading($, 'Vinto da');
  if (!box || !box.length) {
    return null;
  }

  const annoBoxes = box.find('.AnnoBox');
  if (annoBoxes.length < 3) {
    throw new Error('Expected 3 AnnoBox in "Vinto da"');
  }

  const contradaEl = $(annoBoxes[0]);
  const cavalloEl = $(annoBoxes[1]);
  const fantinoEl = $(annoBoxes[2]);

  const contradaCode = extractOnclickCode(contradaEl, 'DC');
  const contradaName = contradaEl.find('img').attr('alt')?.trim() || nameFromCode(contradaCode);

  const cavalloSourceId = extractOnclickCode(cavalloEl, 'DE');
  const cavalloNome = cavalloEl.find('.Nominativo strong').first().text().trim();

  const fantinoSourceId = extractOnclickCode(fantinoEl, 'DF');
  const fantinoBlock = fantinoEl.find('.Nominativo.Fantino, .Nominativo').last();
  const fantinoHtml = fantinoBlock.html() || '';
  const { nome: fantinoNome, soprannome: fantinoSoprannome } = parseFantinoNominativo(
    cheerio.load(`<div>${fantinoHtml}</div>`)('div'),
  );

  return {
    contradaCode,
    contradaName,
    cavallo: cavalloSourceId ? { sourceId: cavalloSourceId, nome: cavalloNome } : null,
    fantino: fantinoSourceId
      ? { sourceId: fantinoSourceId, nome: fantinoNome, soprannome: fantinoSoprannome }
      : null,
  };
}

function parseFantinoNominativo($root) {
  const soprannome = $root.find('strong').first().text().trim() || null;
  const clone = $root.clone();
  clone.find('strong, .Piccolo8, i').remove();
  const raw =
    clone
      .html()
      ?.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ') ?? '';
  let nome = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)[0] ?? '';
  nome = nome.replace(/\s+detto\s*$/i, '').trim();
  return { nome, soprannome };
}

function parseStaffParagraph(p) {
  const text = p.text();

  const pick = (labels) => {
    for (const label of labels) {
      const re = new RegExp(
        `${label}:\\s*([^\\n]+?)(?=\\s*(?:Capitano|Governatore|Priore|Rettore|Mangini|Barbaresco):|$)`,
        'i',
      );
      const m = text.match(re);
      if (m) return stripLinkText(m[1]);
    }
    return null;
  };

  const capitano = pick(['Capitano']);
  const priore = pick(['Governatore', 'Priore', 'Rettore']);
  const barbaresco = pick(['Barbaresco']);

  let mangini = [];
  const manginiMatch = text.match(/Mangini:\s*(.+?)(?=\s*Barbaresco:|$)/is);
  if (manginiMatch) {
    mangini = manginiMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return { capitano, priore, barbaresco, mangini };
}

function stripLinkText(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function decodeHtmlAttr(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractOnclickCode(el, fn) {
  const raw =
    el.attr('onclick') ||
    el.attr('ng-click') ||
    el.find('[onclick]').first().attr('onclick') ||
    '';
  const onclick = decodeHtmlAttr(raw);
  const re = new RegExp(`${fn}\\s*\\(\\s*['"]?([^'")\\s]+)['"]?\\s*\\)`, 'i');
  const m = onclick.match(re);
  if (!m) return null;
  let code = m[1];
  if (fn === 'DC' && code.startsWith('-')) code = code.slice(1);
  return code;
}
