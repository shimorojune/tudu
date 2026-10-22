import { describe, expect, it } from 'vitest';
import {
  isRefLike,
  lookAlikes,
  matchScore,
  rankSearch,
  searchTokens,
  searchWhere,
  snippetOf,
  whereRank,
  wordsOf,
  closeMatches,
  embeddingText,
  lookAlikesScored,
  mergeLookAlikes,
  MEANING_LIMIT,
} from './search';

const TODAY = '2026-10-18';

function t(ref: string, title: string, day: string | null, extra: { done?: boolean; notes?: string } = {}) {
  return { ref, title, day, done: extra.done ?? false, notes: extra.notes ?? '' };
}

describe('C07-U01 ranking', () => {
  it('splits the words and finds every one somewhere, else no match', () => {
    expect(searchTokens('  Pay the  bill ')).toEqual(['pay', 'the', 'bill']);
    expect(matchScore(t('ME-1', 'Pay the electricity bill', TODAY), 'pay bill')).not.toBeNull();
    expect(matchScore(t('ME-1', 'Pay the electricity bill', TODAY), 'pay gas')).toBeNull();
    expect(matchScore(t('ME-1', 'Pay the electricity bill', TODAY), '   ')).toBeNull();
  });

  it('the tiers: the ID in full, the title starting with the words, every word at a word start, anywhere, the ID, the note', () => {
    const score = (title: string, q: string, extra = {}) =>
      matchScore(t('ME-52', title, TODAY, extra), q)!.score;
    expect(score('Review the PR', 'me-52')).toBe(100);
    expect(score('Meera’s Quick Add demo', 'meera')).toBe(70);
    expect(score('Sync with Meera on onboarding copy', 'meera on')).toBe(58);
    expect(score('Sync with Meera on onboarding copy', 'meera copy')).toBe(50);
    expect(score('Sync with Meera on onboarding copy', 'eera')).toBe(42);
    expect(score('Sync with Meera on onboarding copy', 'eera cop')).toBe(34);
    expect(score('Review the PR', 'me-5')).toBe(40);
    expect(score('Review the PR', 'dietary', { notes: 'Ask about dietary needs' })).toBe(16);
    expect(
      matchScore(t('ME-52', 'Review the PR', TODAY, { notes: 'Ask about dietary needs' }), 'dietary')!
        .inNotes,
    ).toBe(true);
    expect(matchScore(t('ME-52', 'Review the PR', TODAY), 'review')!.inNotes).toBe(false);
  });

  it('crossed off sits a step below the same match', () => {
    expect(matchScore(t('ME-1', 'Pay the bill', TODAY, { done: true }), 'pay')!.score).toBe(64);
  });

  it('ties go to today, the days ahead, the Backlog, the days behind, then the crossed off', () => {
    const order = [
      whereRank(TODAY, false, TODAY),
      whereRank('2026-10-19', false, TODAY),
      whereRank('2026-10-25', false, TODAY),
      whereRank(null, false, TODAY),
      whereRank('2026-10-17', false, TODAY),
      whereRank('2026-10-01', false, TODAY),
      whereRank(TODAY, true, TODAY),
      whereRank('2026-10-19', true, TODAY),
      whereRank('2026-10-17', true, TODAY),
      whereRank(null, true, TODAY),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('ranks best first, then by where, then by the order they came; at most the limit', () => {
    const items = [
      t('ME-1', 'Old passport renewal', '2026-10-10'),
      t('ME-2', 'Renew passport', null),
      t('ME-3', 'Renew passport', TODAY),
      t('ME-4', 'Renew the passport', '2026-10-20', { done: true }),
      t('ME-5', 'Gutters', TODAY, { notes: 'and renew the passport' }),
      t('ME-6', 'Renew passport', '2026-10-19'),
    ];
    const hits = rankSearch(items, 'renew passport', TODAY);
    // ME-1 scores 50 ("renew" and "passport" start words of its title); ME-4 is 50 less the crossed-off step
    expect(hits.map((h) => h.item.ref)).toEqual(['ME-3', 'ME-6', 'ME-2', 'ME-1', 'ME-4', 'ME-5']);
    expect(hits[5]!.snippet).toBe('and renew the passport');
    expect(hits[0]!.snippet).toBeNull();
    expect(rankSearch(items, 'renew passport', TODAY, 2).map((h) => h.item.ref)).toEqual(['ME-3', 'ME-6']);
    expect(rankSearch(items, 'me-6', TODAY).map((h) => h.item.ref)).toEqual(['ME-6']);
  });

  it('knows a task ID typed in full', () => {
    expect(isRefLike('ME-52')).toBe(true);
    expect(isRefLike(' tudu-219 ')).toBe(true);
    expect(isRefLike('ME-')).toBe(false);
    expect(isRefLike('meera')).toBe(false);
  });
});

describe('C07-U02 the note line and the where words', () => {
  it('cuts the note around the first matched word, with ellipses where it was cut', () => {
    const note =
      'Half a day of planning, half a day out. Ask about dietary needs for the dinner, and book the room by Friday.';
    expect(snippetOf(note, 'dietary')).toBe(
      '…half a day out. Ask about dietary needs for the dinner, and book the room by Friday.',
    );
    expect(snippetOf('Ask about dietary needs', 'dietary')).toBe('Ask about dietary needs');
    expect(snippetOf(`${'x'.repeat(120)} end`, 'zzz')).toBe('x'.repeat(90));
    expect(snippetOf('First line\n\nSecond   line', 'second')).toBe('First line Second line');
  });

  it('says where a task lives', () => {
    expect(searchWhere(TODAY, false, TODAY)).toEqual({ label: 'Today', tone: 'today' });
    expect(searchWhere('2026-10-19', false, TODAY)).toEqual({ label: 'Tomorrow', tone: null });
    expect(searchWhere('2026-10-17', false, TODAY)).toEqual({ label: 'Yesterday', tone: null });
    expect(searchWhere('2026-10-23', false, TODAY)).toEqual({ label: 'Fri 23 Oct', tone: null });
    expect(searchWhere(null, false, TODAY)).toEqual({ label: 'Backlog', tone: null });
    expect(searchWhere(TODAY, true, TODAY)).toEqual({ label: 'Today · crossed off', tone: null });
    expect(searchWhere(null, true, TODAY)).toEqual({ label: 'Backlog · crossed off', tone: null });
  });
});

describe('C07-U03 look-alikes', () => {
  const items = [
    { key: 'a', title: 'Renew passport', done: false },
    { key: 'b', title: 'Renew the domain', done: false },
    { key: 'c', title: 'Passport photos', done: true },
    { key: 'd', title: 'Run the request status enum migration and backfill on staging', done: false },
    { key: 'e', title: 'Run the request status enum migration on production', done: false },
    { key: 'f', title: 'Write the release notes', done: false },
  ];

  it('keeps the words that carry meaning', () => {
    expect(wordsOf('Renew my passport, the old one')).toEqual(['renew', 'passport', 'one']);
  });

  it('finds open tasks sharing enough words, the closest first, at most three', () => {
    // one shared word is enough for a title of two words: "Renew the domain" follows, less close
    expect(lookAlikes(items, 'Renew my passport').map((x) => x.key)).toEqual(['a', 'b']);
    expect(lookAlikes(items, 'Run the migration on staging').map((x) => x.key)).toEqual(['d', 'e']);
    expect(lookAlikes(items, 'Renew passport photos').map((x) => x.key)).toEqual(['a']);
  });

  it('nothing for a short title, no shared words, or a word shared with a long title only', () => {
    expect(lookAlikes(items, 'Run')).toEqual([]);
    expect(lookAlikes(items, 'Buy milk')).toEqual([]);
    expect(lookAlikes(items, 'Run the dishwasher tonight')).toEqual([]);
    expect(lookAlikes(items, 'the and of')).toEqual([]);
  });
});

describe('C13-U01 close matches', () => {
  const t = (id: string) => ({ id });
  it('C13-U01 orders by closeness, applies the floor, drops excluded ids and stops at four; the text embedded is the title and the first 300 characters of the notes, trimmed and lowercased', () => {
    const found = [
      { item: t('a'), similarity: 0.5 },
      { item: t('b'), similarity: 0.9 },
      { item: t('c'), similarity: 0.39 },
      { item: t('d'), similarity: 0.7 },
      { item: t('e'), similarity: 0.6 },
      { item: t('f'), similarity: 0.55 },
    ];
    expect(closeMatches(found).map((m) => m.item.id)).toEqual(['b', 'd', 'e', 'f']);
    expect(closeMatches(found, ['b', 'e']).map((m) => m.item.id)).toEqual(['d', 'f', 'a', 'c']);
    expect(closeMatches(found, [], 4, 0.4).map((m) => m.item.id)).toEqual(['b', 'd', 'e', 'f']);
    expect(closeMatches(found, [], 2).map((m) => m.item.id)).toEqual(['b', 'd']);
    expect(closeMatches(found, [], 4, 0.65).map((m) => m.item.id)).toEqual(['b', 'd']);
    expect(MEANING_LIMIT).toBe(4);
    expect(embeddingText('  Renew Passport ', null)).toBe('renew passport');
    expect(embeddingText('Renew passport', '  Photos   in the\n drawer. ')).toBe(
      'renew passport\nphotos in the drawer.',
    );
    expect(embeddingText('A', 'x'.repeat(400))).toBe(`a\n${'x'.repeat(300)}`);
  });
});

describe('C13-U02 Quick Add merge', () => {
  const it2 = (id: string, title: string, done = false) => ({ id, title, done });
  it('C13-U02 shared words and meaning on one scale, duplicates folded, open tasks only, at most three, nothing under four characters', () => {
    const renew = it2('a', 'Renew passport');
    const photos = it2('b', 'Passport photos');
    const expires = it2('c', 'Passport expires in March');
    const flights = it2('d', 'Book flights');
    const done = it2('e', 'Renew my passport now', true);
    const words = lookAlikesScored([renew, photos, done, expires], 'Renew my passport');
    // every word shared scores 1, one of two 0.5 (chunk 07's rule); crossed off never
    expect(words.map((w) => [w.item.id, w.score])).toEqual([
      ['a', 1],
      ['b', 0.5],
      ['c', 0.5],
    ]);
    // on one scale a full word match is 1 and a half match 0.75; a meaning match scores its similarity
    const merged = mergeLookAlikes(words, [
      { item: expires, similarity: 0.62 },
      { item: renew, similarity: 0.97 },
      { item: flights, similarity: 0.41 },
      { item: photos, similarity: 0.5 },
    ]);
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // meaning alone, closest first, three at most
    expect(
      mergeLookAlikes(
        [],
        [
          { item: flights, similarity: 0.41 },
          { item: expires, similarity: 0.62 },
          { item: photos, similarity: 0.5 },
          { item: renew, similarity: 0.45 },
        ],
      ).map((x) => x.id),
    ).toEqual(['c', 'b', 'a']);
    // the sure thing stays even when the model finds it far
    expect(
      mergeLookAlikes([{ item: renew, score: 0.5 }], [{ item: flights, similarity: 0.7 }]).map((x) => x.id),
    ).toEqual(['a', 'd']);
    expect(lookAlikesScored([renew], 'Ren')).toEqual([]);
    expect(mergeLookAlikes([], [])).toEqual([]);
  });
});
