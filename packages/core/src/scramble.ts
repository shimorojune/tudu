/**
 * Scramble my text (#67): a person's words drawn as jumbled letters of the same shape, for screenshots. Letter for
 * letter: a capital stays a capital, a digit a digit, and spaces, punctuation, `@`, `#` and emoji stay put, so a bug
 * about a long title, a wrong count or a clipped row still shows. Only how words are drawn on one device changes;
 * nothing saved does.
 *
 * Each pick comes from a hash of the key, the whole word and the character's place, so a word jumbles the same way on
 * every render (no flicker) and different words differ. The key is random and never leaves the device: the code is
 * public, so a fixed mapping could be undone. Word lengths and which words repeat still show; that is the price of an
 * honest layout.
 */

/** Ranges a character is swapped within: its own script, and its own case where the script has one. */
const RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x41, 0x5a], // A-Z
  [0x61, 0x7a], // a-z
  [0x30, 0x39], // 0-9
  [0x391, 0x3a1], // Greek capitals Α-Ρ (U+03A2 is unassigned)
  [0x3a3, 0x3a9], // Greek capitals Σ-Ω
  [0x3ac, 0x3ce], // Greek small, accented ones too (ά-ώ)
  [0x410, 0x42f], // Cyrillic capitals А-Я
  [0x430, 0x44f], // Cyrillic small а-я
  [0x5d0, 0x5ea], // Hebrew
  [0x621, 0x64a], // Arabic letters
  [0x905, 0x939], // Devanagari letters
  [0x3041, 0x3096], // Hiragana
  [0x30a1, 0x30fa], // Katakana
  [0x4e00, 0x9fff], // CJK ideographs
  [0xac00, 0xd7a3], // Hangul syllables
];

/** A letter, digit or mark: what a word is made of. */
const WORD = /[\p{L}\p{N}\p{M}]+/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function rangeOf(cp: number): readonly [number, number] | null {
  for (const r of RANGES) if (cp >= r[0] && cp <= r[1]) return r;
  return null;
}

/** Latin with an accent (é, Ø, ß) becomes a plain Latin letter of the same case. */
function latinRange(ch: string): readonly [number, number] | null {
  if (!/\p{Script=Latin}/u.test(ch)) return null;
  const upper = ch !== ch.toLowerCase();
  return upper ? RANGES[0]! : RANGES[1]!;
}

/** FNV-1a, then a final mix: small, fast and plenty for spreading picks. Not a security primitive; the key is. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function scrambleWord(word: string, key: string): string {
  const seed = hash(`${key}\u0000${word}`);
  let out = '';
  let i = 0;
  for (const ch of word) {
    i++;
    const cp = ch.codePointAt(0)!;
    if (!LETTER_OR_DIGIT.test(ch)) {
      // A combining mark (an Indic vowel sign, an accent) rides on the letter before it.
      out += ch;
      continue;
    }
    const range = rangeOf(cp) ?? latinRange(ch);
    if (!range) {
      out += '•';
      continue;
    }
    const size = range[1] - range[0] + 1;
    const h = hash(`${seed}:${i}`);
    // Never itself: a step of 1 to size-1 along its range.
    const next =
      range[0] + (((cp >= range[0] && cp <= range[1] ? cp - range[0] : 0) + 1 + (h % (size - 1))) % size);
    out += String.fromCodePoint(next);
  }
  return out;
}

const cache = new Map<string, string>();
const CACHE_MAX = 5000;

/** `text` with every word jumbled under `key`; everything that isn't a letter or digit kept where it is. */
export function scrambleText(text: string, key: string): string {
  if (!text) return text;
  const k = `${key}\u0001${text}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const out = text.replace(WORD, (w) => scrambleWord(w, key));
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(k, out);
  return out;
}
