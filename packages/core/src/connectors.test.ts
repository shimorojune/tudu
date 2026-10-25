import { describe, expect, it } from 'vitest';
import {
  isConnectorProvider,
  linkKeyOf,
  matchScore,
  parseLinkKey,
  rankSearch,
  SCORE_REF,
  withLink,
  type TaskLink,
} from './index';

describe('connectors (C10-U17, C10-U18)', () => {
  it('knows its apps, reads a key in each app’s form, and keeps one link per app', () => {
    expect(isConnectorProvider('jira')).toBe(true);
    expect(isConnectorProvider('linear')).toBe(false);
    expect(isConnectorProvider(undefined)).toBe(false);

    expect(parseLinkKey('jira', ' tudu-212 ')).toBe('TUDU-212');
    expect(parseLinkKey('jira', 'not a key')).toBeNull();

    const none: TaskLink[] = [];
    const one = withLink(none, 'jira', 'TUDU-1');
    expect(one).toEqual([{ provider: 'jira', key: 'TUDU-1' }]);
    expect(linkKeyOf(one, 'jira')).toBe('TUDU-1');
    // Linking again replaces, never adds a second Jira link; null takes it off.
    expect(withLink(one, 'jira', 'TUDU-2')).toEqual([{ provider: 'jira', key: 'TUDU-2' }]);
    expect(withLink(one, 'jira', null)).toEqual([]);
    expect(linkKeyOf(undefined, 'jira')).toBeNull();
    expect(none).toEqual([]);
  });

  it('search finds a task by any of its link keys (C10-U17)', () => {
    const linked = { ref: 'ME-5', title: 'Fix the picker', done: false, keys: ['TUDU-212'] };
    // A key typed in full, in any case, is the top hit, as a task ID is.
    expect(matchScore(linked, 'TUDU-212')!.score).toBe(SCORE_REF);
    expect(matchScore(linked, 'tudu-212')!.score).toBe(SCORE_REF);
    // A part of a key scores as a word found in the ID.
    expect(matchScore(linked, '212')!.score).toBe(40);
    // Keys from two apps: either one finds it.
    const two = { ...linked, keys: ['TUDU-212', 'ENG-7'] };
    expect(matchScore(two, 'eng-7')!.score).toBe(SCORE_REF);
    expect(matchScore(two, 'tudu-212')!.score).toBe(SCORE_REF);
    // No links: scored as before, the key words are found nowhere.
    expect(matchScore({ ...linked, keys: [] }, 'tudu-212')).toBeNull();
    expect(matchScore({ ref: 'ME-5', title: 'Fix the picker', done: false }, 'picker')!.score).toBe(58);

    const ranked = rankSearch(
      [
        { ref: 'ME-1', title: 'TUDU-212 notes', day: null, done: false, keys: [] },
        { ref: 'ME-2', title: 'Fix the picker', day: null, done: false, keys: ['TUDU-212'] },
      ],
      'TUDU-212',
      '2026-10-25',
      10,
    );
    expect(ranked[0]!.item.ref).toBe('ME-2');
  });
});
