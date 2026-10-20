import { describe, expect, it } from 'vitest';
import { dueLabel, dueWords } from './due';

const SUNDAY = '2026-10-18';

describe('C03-U23 due words', () => {
  it('C03-U23 names the weekday within a week and the date further out', () => {
    expect(dueLabel('2026-10-23', SUNDAY)).toEqual({
      label: 'Fri',
      tip: 'Due Friday',
      overdue: false,
      iso: '2026-10-23',
    });
    expect(dueLabel('2026-11-04', SUNDAY)).toEqual({
      label: '4 Nov',
      tip: 'Due Wednesday 4 November',
      overdue: false,
      iso: '2026-11-04',
    });
  });

  it('C03-U23 says overdue once today is past the date', () => {
    expect(dueLabel('2026-10-16', SUNDAY)).toEqual({
      label: 'Fri',
      tip: 'Was due Friday',
      overdue: true,
      iso: '2026-10-16',
    });
    expect(dueLabel(SUNDAY, SUNDAY).overdue).toBe(false);
  });

  it('C03-U23 says how far: today, tomorrow, in 4 days, in 3 weeks, 1 day overdue, 2 weeks overdue', () => {
    expect(dueWords(SUNDAY, SUNDAY)).toEqual({ text: 'today', tone: 'today' });
    expect(dueWords('2026-10-19', SUNDAY)).toEqual({ text: 'tomorrow', tone: '' });
    expect(dueWords('2026-10-22', SUNDAY)).toEqual({ text: 'in 4 days', tone: '' });
    expect(dueWords('2026-11-08', SUNDAY)).toEqual({ text: 'in 3 weeks', tone: '' });
    expect(dueWords('2026-10-17', SUNDAY)).toEqual({ text: '1 day overdue', tone: 'overdue' });
    expect(dueWords('2026-10-04', SUNDAY)).toEqual({ text: '2 weeks overdue', tone: 'overdue' });
  });
});
