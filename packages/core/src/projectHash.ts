/**
 * # in a task's title picks its project. A `#` typed at the start of a title or after a space opens a menu of the
 * space's projects; the letters after it narrow the menu; picking one takes the `#word` out of the title. A `#` right
 * before a digit (`#92`) or inside a word (`C#`) is just text.
 */

/** The `#word` the caret is in: where its `#` sits, where it ends (the caret) and the letters after the `#`. */
export interface HashToken {
  start: number;
  end: number;
  query: string;
}

const HASH_RE = /(^|\s)#([^\s#]*)$/;

/** The `#word` the caret is at the end of, or null when there is none worth a menu. */
export function hashAt(text: string, caret: number): HashToken | null {
  const m = HASH_RE.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[2]!;
  if (/^\d/.test(query)) return null;
  return { start: caret - query.length - 1, end: caret, query };
}

/** The projects a query finds: names that start with it first, then names with a word that starts with it. */
export function hashMatches<P extends { name: string }>(projects: readonly P[], query: string): P[] {
  const q = query.toLocaleLowerCase();
  if (!q) return projects.slice();
  const lead: P[] = [];
  const word: P[] = [];
  for (const p of projects) {
    const n = p.name.toLocaleLowerCase();
    if (n.startsWith(q)) lead.push(p);
    else if (n.split(/\s+/).some((w) => w.startsWith(q))) word.push(p);
  }
  return lead.concat(word);
}

/** Where the matched letters sit in a project's name, for the bold part: [from, to), or null. */
export function hashMark(name: string, query: string): [number, number] | null {
  if (!query) return null;
  const n = name.toLocaleLowerCase();
  const q = query.toLocaleLowerCase();
  if (n.startsWith(q)) return [0, q.length];
  const at = n.indexOf(` ${q}`);
  return at < 0 ? null : [at + 1, at + 1 + q.length];
}

/** The project whose whole name is the query (any case): `#home ` with a space picks Home outright. */
export function exactProject<P extends { name: string }>(projects: readonly P[], query: string): P | null {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return null;
  return projects.find((p) => p.name.trim().toLocaleLowerCase() === q) ?? null;
}

/** The title without the `#word`, spaces closed up, and where the caret goes. */
export function dropHash(text: string, token: Pick<HashToken, 'start' | 'end'>): { text: string; caret: number } {
  const before = text.slice(0, token.start).replace(/\s+$/, '');
  const after = text.slice(token.end).replace(/^\s+/, '');
  const gap = before && after ? ' ' : '';
  return { text: before + gap + after, caret: before.length + gap.length };
}

/** The name a new project made from `#garden` gets: Garden. A name typed with capitals of its own stays as typed. */
export function hashProjectName(query: string): string {
  const q = query.trim();
  if (q !== q.toLocaleLowerCase()) return q;
  return q ? q.charAt(0).toLocaleUpperCase() + q.slice(1) : '';
}
