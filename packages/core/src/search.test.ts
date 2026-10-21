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
    const score = (title: string, q: string, extra = {}) => matchScore(t('ME-52', title, TODAY, extra), q)!.score;
    expect(score('Review the PR', 'me-52')).toBe(100);
    expect(score('Meera’s Quick Add demo', 'meera')).toBe(70);
    expect(score('Sync with Meera on onboarding copy', 'meera on')).toBe(58);
    expect(score('Sync with Meera on onboarding copy', 'meera copy')).toBe(50);
    expect(score('Sync with Meera on onboarding copy', 'eera')).toBe(42);
    expect(score('Sync with Meera on onboarding copy', 'eera cop')).toBe(34);
    expect(score('Review the PR', 'me-5')).toBe(40);
    expect(score('Review the PR', 'dietary', { notes: 'Ask about dietary needs' })).toBe(16);
    expect(matchScore(t('ME-52', 'Review the PR', TODAY, { notes: 'Ask about dietary needs' }), 'dietary')!.inNotes).toBe(true);
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
    expect(snippetOf(note, 'dietary')).toBe('…half a day out. Ask about dietary needs for the dinner, and book the room by Friday.');
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
