/**
 * Attachment chips in notes and comments. One chip is one line: an icon, the name (cut with … before the extension,
 * which always shows) and the size. The editor, the read-only view and the server all write it with `chipHtml`, so
 * they can never drift apart.
 */
import { fileSize } from './quickadd';

export interface ChipFile {
  id: string;
  name: string;
  size: number;
}

/** The name before its extension, and the extension with its dot. "archive.tar.gz" ends in ".gz"; ".env" has none. */
export function splitFileName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  const ext = name.slice(dot);
  if (ext.length < 2 || ext.length > 9 || /\s/.test(ext)) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpeg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/tiff': '.tiff',
};

/**
 * What a pasted file is called. A screenshot from the clipboard arrives as "image.png" (or with no name at all), so
 * it becomes "Pasted image 24 Oct 14.32.png"; a file with a real name keeps it.
 */
export function pastedFileName(name: string, type: string, now: Date): string {
  const n = name.trim();
  if (n && !/^image\.[a-z0-9]+$/i.test(n)) return n;
  const ext = n ? splitFileName(n).ext.toLowerCase() : (IMAGE_TYPES[type] ?? '');
  const p = (x: number) => String(x).padStart(2, '0');
  return `Pasted image ${now.getDate()} ${MONTHS[now.getMonth()]} ${p(now.getHours())}.${p(now.getMinutes())}${ext}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function unesc(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** The inside of a chip: the icon, the name in two parts and the size. */
export function chipInnerHtml(f: { name: string; size: number }): string {
  const { stem, ext } = splitFileName(f.name);
  return (
    '<span class="tp-att-i"></span>' +
    `<span class="tp-att-n"><span class="tp-att-stem">${esc(stem)}</span>` +
    (ext ? `<span class="tp-att-ext">${esc(ext)}</span>` : '') +
    `</span><span class="tp-att-s">${fileSize(f.size)}</span>`
  );
}

/** A whole chip as stored: it links to the API's own file route. */
export function chipHtml(f: ChipFile): string {
  return (
    `<a class="tp-att" href="/api/files/${esc(f.id)}" data-id="${esc(f.id)}" data-name="${esc(f.name)}" ` +
    `data-size="${f.size}" title="${esc(f.name)}">${chipInnerHtml(f)}</a>`
  );
}

const CHIP_RE = /<a\b[^>]*\bclass="tp-att"[^>]*>[\s\S]*?<\/a>/g;
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/**
 * Redraw every chip in cleaned HTML from its data attributes, so chips stored before the name was split (a bare name
 * that could wrap) read like new ones. Everything else, the chip's attributes included, stays as the cleaner left it.
 */
export function upgradeChips(html: string): string {
  return html.replace(CHIP_RE, (chip) => {
    const open = /^<a\b[^>]*>/.exec(chip)![0];
    const name = attr(open, 'data-name');
    if (name === undefined) return chip;
    const size = Number(attr(open, 'data-size') ?? 0);
    const titled = /\btitle="/.test(open) ? open : open.replace(/>$/, ` title="${name}">`);
    return `${titled}${chipInnerHtml({ name: unesc(name), size })}</a>`;
  });
}
