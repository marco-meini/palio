import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true,
});

function wrapTables(html: string): string {
  return html.replace(
    /<table([\s\S]*?)<\/table>/gi,
    '<div class="table-wrap"><table$1</table></div>',
  );
}

export function renderMarkdown(content: string): string {
  const raw = marked.parse(content, { async: false }) as string;
  const wrapped = wrapTables(raw);
  return DOMPurify.sanitize(wrapped, {
    USE_PROFILES: { html: true },
  });
}
