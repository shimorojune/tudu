import { describe, expect, it } from 'vitest';
import { historyWords, whenWords } from './history';

const SUNDAY = '2026-10-18';
const at = '2026-10-15T10:12:00.000Z';

describe('C03-U17 history words', () => {
  it('C03-U17 says what happened in plain words', () => {
    expect(historyWords({ id: 1, at, kind: 'created' }, SUNDAY)).toBe('Created');
    expect(historyWords({ id: 2, at, kind: 'due.set', due: '2026-10-16' }, SUNDAY)).toBe(
      'Due date set to Fri 16 Oct',
    );
    expect(historyWords({ id: 3, at, kind: 'due.cleared' }, SUNDAY)).toBe('Due date removed');
    expect(historyWords({ id: 4, at, kind: 'moved', from: null, to: SUNDAY }, SUNDAY)).toBe(
      'Moved from the Backlog to Today',
    );
    expect(historyWords({ id: 5, at, kind: 'moved', from: SUNDAY, to: '2026-10-19' }, SUNDAY)).toBe(
      'Moved from Today to Tomorrow',
    );
    expect(historyWords({ id: 6, at, kind: 'carried', from: '2026-10-17' }, SUNDAY)).toBe(
      'Carried over from Sat 17 Oct',
    );
    expect(historyWords({ id: 7, at, kind: 'crossed' }, SUNDAY)).toBe('Crossed off');
    expect(historyWords({ id: 8, at, kind: 'uncrossed' }, SUNDAY)).toBe('Uncrossed');
    expect(historyWords({ id: 9, at, kind: 'restored' }, SUNDAY)).toBe('Put back after a delete');
  });

  it('C03-U17 says when, short', () => {
    const now = new Date(2026, 9, 18, 16, 40);
    expect(whenWords(new Date(2026, 9, 18, 16, 39, 40).toISOString(), now)).toBe('Just now');
    expect(whenWords(new Date(2026, 9, 18, 10, 12).toISOString(), now)).toBe('10:12');
    expect(whenWords(new Date(2026, 9, 15, 10, 12).toISOString(), now)).toBe('Thu 10:12');
    expect(whenWords(new Date(2026, 9, 4, 10, 12).toISOString(), now)).toBe('4 Oct');
    expect(whenWords(new Date(2025, 9, 4, 10, 12).toISOString(), now)).toBe('4 Oct 2025');
  });
});
