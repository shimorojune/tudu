/**
 * Notes and comments are rich text, stored as HTML. The editor (Tiptap) makes a small set of tags; this cleaner
 * keeps exactly those and drops everything else, so what one person writes can never run as code on another's
 * screen. Pure, with no DOM, so the server and the client clean the same way.
 */

/** Notes may hold this many characters of HTML; comments a fifth of it. */
export const NOTES_MAX = 100_000;
export const COMMENT_MAX = 20_000;

const BLOCKS = new Set(['p', 'h2', 'h3', 'blockquote', 'pre', 'ul', 'ol', 'li', 'hr', 'div', 'label']);
const INLINE = new Set([
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'mark',
  'code',
  'a',
  'br',
  'sup',
  'sub',
  'span',
  'input',
]);
const VOID = new Set(['br', 'hr', 'input']);
/** Everything inside these goes, not just the tags. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'template',
  'noscript',
]);

const TAG_RE =
  /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*\/?>|<!--[\s\S]*?-->|<[!?/][^>]*>/g;
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
const SAFE_URL = /^(https?:|mailto:)/i;
const ALIGN = /^\s*text-align:\s*(left|center|right)\s*;?\s*$/;

function cleanAttrs(tag: string, raw: string): string {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1]!.toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    const v = value.replace(/&quot;/g, '"').trim();
    if (tag === 'a' && name === 'href' && SAFE_URL.test(v)) {
      out.push(`href="${esc(v)}" rel="noopener noreferrer" target="_blank"`);
    } else if ((tag === 'ul' || tag === 'li') && name === 'data-type' && /^(taskList|taskItem)$/.test(v)) {
      out.push(`data-type="${v}"`);
    } else if (tag === 'li' && name === 'data-checked' && /^(true|false)$/.test(v)) {
      out.push(`data-checked="${v}"`);
    } else if (tag === 'ul' && name === 'class' && v === 'tp-checks') {
      out.push('class="tp-checks"');
    } else if (name === 'style' && ALIGN.test(v) && BLOCKS.has(tag)) {
      out.push(`style="text-align: ${ALIGN.exec(v)![1]}"`);
    } else if (tag === 'input' && name === 'type' && v === 'checkbox') {
      out.push('type="checkbox" disabled=""');
    } else if (tag === 'input' && name === 'checked') {
      out.push('checked=""');
    }
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

function esc(s: string): string {
  return s
    .replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Keep the tags the editor makes (paragraphs, headings, quotes, code, lists and checklists, the inline marks,
 * safe links) and nothing else; balance what is left. Text keeps its entities.
 */
export function cleanHtml(html: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let last = 0;
  let dropUntil: string | null = null;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    const text = html.slice(last, m.index);
    last = m.index + m[0].length;
    if (!dropUntil) out.push(esc(text));
    const name = m[1]?.toLowerCase();
    if (!name) continue; // a comment or junk: gone
    const closing = m[0].startsWith('</');
    if (dropUntil) {
      if (closing && name === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing) dropUntil = name;
      continue;
    }
    if (!BLOCKS.has(name) && !INLINE.has(name)) continue;
    if (closing) {
      const i = open.lastIndexOf(name);
      if (i < 0) continue;
      while (open.length > i) out.push(`</${open.pop()}>`);
      continue;
    }
    const attrs = cleanAttrs(name, m[2] ?? '');
    if (VOID.has(name)) {
      out.push(`<${name}${attrs}>`);
      continue;
    }
    out.push(`<${name}${attrs}>`);
    open.push(name);
  }
  if (!dropUntil) out.push(esc(html.slice(last)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('');
}

/** True when the HTML holds no words and nothing to look at (an empty paragraph is empty). */
export function isEmptyHtml(html: string): boolean {
  return !html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** The words alone, for a search index or a short preview. */
export function textOf(html: string): string {
  return html
    .replace(/<\/(p|li|h2|h3|blockquote|pre|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
