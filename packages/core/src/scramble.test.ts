import { describe, expect, it } from 'vitest';
import { scrambleText } from './scramble';

const KEY = '00112233445566778899aabbccddeeff';
const OTHER = 'ffeeddccbbaa99887766554433221100';

/** The kind of each character: what must survive a scramble. */
const shape = (s: string) =>
  Array.from(s, (c) =>
    /\p{Lu}/u.test(c) ? 'A' : /\p{Ll}/u.test(c) ? 'a' : /\p{Nd}/u.test(c) ? '9' : c,
  ).join('');

describe('scrambleText (chunk 23)', () => {
  it('C23-U01 same length and shape: case, digits, spaces, punctuation, @, # and emoji kept; letters move', () => {
    const text = 'Call Priya about the Q3 invoice, #42 @rohit 🎉 (by Fri).';
    const out = scrambleText(text, KEY);
    expect(Array.from(out)).toHaveLength(Array.from(text).length);
    expect(shape(out)).toBe(shape(text));
    expect(out).toContain('🎉');
    expect(out).toContain(' #');
    expect(out).toContain(' @');
    expect(out).toContain('(');
    // No letter keeps its place: every letter steps along its range, never onto itself.
    const a = Array.from(text);
    const b = Array.from(out);
    for (let i = 0; i < a.length; i++) if (/[\p{L}\p{N}]/u.test(a[i]!)) expect(b[i]).not.toBe(a[i]);
    // Accented Latin becomes plain Latin of the same case.
    expect(shape(scrambleText('Café Øre', KEY))).toBe('Aaaa Aaa');
    expect(scrambleText('', KEY)).toBe('');
  });

  it('C23-U02 the same key and word jumble the same way; another key differs; 3+ letters never come out as they went in', () => {
    expect(scrambleText('Zorbleck', KEY)).toBe(scrambleText('Zorbleck', KEY));
    // The whole word seeds it: the same word in another sentence jumbles the same.
    const one = scrambleText('Zorbleck today', KEY).split(' ')[0];
    const two = scrambleText('see Zorbleck', KEY).split(' ')[1];
    expect(one).toBe(two);
    expect(scrambleText('Zorbleck', OTHER)).not.toBe(scrambleText('Zorbleck', KEY));
    // Different words differ, even of one length.
    expect(scrambleText('house', KEY)).not.toBe(scrambleText('mouse', KEY));
    for (const w of ['cat', 'Tudu', 'invoice', 'ABC', '2026']) expect(scrambleText(w, KEY)).not.toBe(w);
  });

  it('C23-U03 Cyrillic and Greek stay in their script and case; CJK stays CJK; other letters become •', () => {
    const ru = scrambleText('Привет мир', KEY);
    expect(ru).toMatch(/^\p{Script=Cyrillic}{6} \p{Script=Cyrillic}{3}$/u);
    expect(ru[0]).toMatch(/\p{Lu}/u);
    expect(ru.slice(1, 6)).toMatch(/^\p{Ll}+$/u);
    const el = scrambleText('Γειά σου', KEY);
    expect(el.replace(/\s/g, '')).toMatch(/^\p{Script=Greek}+$/u);
    expect(el[0]).toMatch(/\p{Lu}/u);
    const zh = scrambleText('会议记录', KEY);
    expect(zh).toMatch(/^\p{Script=Han}{4}$/u);
    expect(zh).not.toBe('会议记录');
    // Armenian isn't one of the known scripts: each letter is a dot, the word keeps its length.
    expect(scrambleText('Բարեւ', KEY)).toBe('•••••');
  });
});
