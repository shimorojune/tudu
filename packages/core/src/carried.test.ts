import { describe, expect, it } from 'vitest';
import { carriedLabel, dayTurn, dayWord, nightWords } from './carried';

const SUNDAY = '2026-10-18';

describe('C02-U22 carried labels', () => {
  it('C02-U22 says the weekday within a week and the date further back', () => {
    expect(carriedLabel('2026-10-17', SUNDAY)).toEqual({
      label: 'Sat',
      tip: 'Carried over from Saturday',
      slipping: false,
    });
    expect(carriedLabel('2026-10-12', SUNDAY).label).toBe('Mon');
    expect(carriedLabel('2026-10-04', SUNDAY)).toEqual({
      label: '4 Oct',
      tip: 'Carried over from Sunday 4 October',
      slipping: true,
    });
  });

  it('C02-U22 turns red once it has been carried two days', () => {
    expect(carriedLabel('2026-10-17', SUNDAY).slipping).toBe(false);
    expect(carriedLabel('2026-10-16', SUNDAY).slipping).toBe(true);
  });

  it('C02-U22 names where a moved task went', () => {
    expect(dayWord(SUNDAY, SUNDAY)).toBe('Today');
    expect(dayWord('2026-10-19', SUNDAY)).toBe('Tomorrow');
    expect(dayWord('2026-10-23', SUNDAY)).toBe('Fri 23 Oct');
    expect(dayWord(null, SUNDAY)).toBe('the Backlog');
  });
});

describe('C02-U23 the working day after midnight', () => {
  it('C02-U23 stays on the list and asks in the small hours, once', () => {
    const night = new Date(2026, 9, 19, 0, 40);
    expect(dayTurn(SUNDAY, new Date(2026, 9, 18, 23, 59))).toEqual({ kind: 'same' });
    expect(dayTurn(SUNDAY, night)).toEqual({ kind: 'ask', from: SUNDAY, to: '2026-10-19' });
    expect(dayTurn(SUNDAY, night, '2026-10-19')).toEqual({ kind: 'same' });
    expect(nightWords(night, SUNDAY, '2026-10-19')).toEqual({
      title: 'It’s 00:40 on Monday.',
      body: 'You’re still on Sunday’s list. Nothing has moved.',
      start: 'Start Monday',
      stay: 'Stay on Sunday',
    });
  });

  it('C02-U23 moves on by itself from 04:00, or after more than a day', () => {
    expect(dayTurn(SUNDAY, new Date(2026, 9, 19, 4, 0))).toEqual({ kind: 'switch', to: '2026-10-19' });
    expect(dayTurn(SUNDAY, new Date(2026, 9, 19, 4, 0), '2026-10-19')).toEqual({
      kind: 'switch',
      to: '2026-10-19',
    });
    expect(dayTurn(SUNDAY, new Date(2026, 9, 20, 1, 0))).toEqual({ kind: 'switch', to: '2026-10-20' });
  });
});
