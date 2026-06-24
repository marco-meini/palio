// @ts-nocheck
/**
 * Heuristic compaction of Postgres CLI box-drawing table output for LLM context.
 */

const TABLE_ROW_RE = /^[│├└].*┆.*[│]?$/;
const BORDER_RE = /^[┌╞└├][─═╌┴┼╪╤╧╥╨╞╡╪┬┴├┤┼┌┐└┘╭╮╯╰─═╌]+$/;

function extractCells(line) {
  if (!line.includes('┆')) return null;
  return line
    .split('┆')
    .map((cell) => cell.replace(/^│\s*|\s*│$/g, '').trim());
}

export function parseCliTable(output) {
  if (!output || !output.includes('┆')) return null;

  const lines = output.split('\n');
    const preamble: string[] = [];
    let headers: string[] | null = null;
    const rows: string[][] = [];
  let pastHeader = false;

  for (const line of lines) {
    if (/^Statement \d+ \(\d+ rows\)/.test(line.trim())) {
      preamble.push(line.trim());
      continue;
    }

    if (BORDER_RE.test(line.trim()) || /^[┌└]/.test(line.trim())) {
      continue;
    }

    if (!TABLE_ROW_RE.test(line)) continue;

    const cells = extractCells(line);
    if (!cells || cells.every((c) => c === '')) continue;

    if (!headers) {
      headers = cells;
      continue;
    }

    if (!pastHeader) {
      if (/^╞/.test(line) || line.includes('═')) continue;
      pastHeader = true;
    }

    if (/^├/.test(line) && line.includes('╌')) {
      rows.push(cells);
      continue;
    }

    if (/^│/.test(line)) {
      rows.push(cells);
    }
  }

  if (!headers || rows.length === 0) return null;

  return { preamble: preamble.join('\n'), headers, rows };
}

export function toMarkdownTable(headers, rows) {
  const escape = (value) => String(value).replace(/\|/g, '\\|');
  const headerLine = `| ${headers.map(escape).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => {
    const padded = headers.map((_, i) => escape(row[i] ?? ''));
    return `| ${padded.join(' | ')} |`;
  });
  return [headerLine, separator, ...body].join('\n');
}

export function compactToolResult(output, options = {}) {
  const { maxRows = 50, maxChars, enabled = true } = options;
  if (!enabled || !output?.trim()) return output;

  const parsed = parseCliTable(output);
  let result = output;

  if (parsed) {
    const { preamble, headers, rows } = parsed;
    const capped = rows.slice(0, maxRows);
    const md = toMarkdownTable(headers, capped);

    result = preamble ? `${preamble}\n${md}` : md;
    if (rows.length > capped.length) {
      result += `\n\n… (${rows.length} righe totali, mostrate ${capped.length})`;
    }
  }

  if (maxChars != null && result.length > maxChars) {
    result = `${result.slice(0, maxChars)}\n\n… (output compattato, ${output.length} caratteri originali)`;
  }

  return result;
}
