import { describe, expect, it } from 'vitest';
import { dueLabel, dueLabelAt, dueWords } from './due';

const SUNDAY = '2026-10-18';

describe('C03-U23 due words', () => {
  it('C03-U23 names the weekday within a week and the date further out', () => {
    expect(dueLabel('2026-10-23', SUNDAY)).toEqual({
      label: 'Fri',
      tip: 'Due Friday',
      overdue: false,
      today: false,
      iso: '2026-10-23',
    });
    expect(dueLabel('2026-11-04', SUNDAY)).toEqual({
      label: '4 Nov',
      tip: 'Due Wednesday 4 November',
      overdue: false,
      today: false,
      iso: '2026-11-04',
    });
  });

  it('C03-U23 says overdue once today is past the date', () => {
    expect(dueLabel('2026-10-16', SUNDAY)).toEqual({
      label: 'Fri',
      tip: 'Was due Friday',
      overdue: true,
      today: false,
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

describe('C03-U30 today, tomorrow, yesterday', () => {
  it('C03-U30 the three nearest days get words; the row says them with no tooltip', () => {
    expect(dueLabel(SUNDAY, SUNDAY)).toEqual({
      label: 'today',
      tip: 'Due today',
      overdue: false,
      today: true,
      iso: SUNDAY,
    });
    expect(dueLabel('2026-10-19', SUNDAY)).toEqual({
      label: 'tomorrow',
      tip: 'Due tomorrow',
      overdue: false,
      today: false,
      iso: '2026-10-19',
    });
    expect(dueLabel('2026-10-17', SUNDAY)).toEqual({
      label: 'yesterday',
      tip: 'Overdue since yesterday',
      overdue: true,
      today: false,
      iso: '2026-10-17',
    });
  });

  it('C03-U30 two days either way is a weekday again', () => {
    expect(dueLabel('2026-10-20', SUNDAY)).toMatchObject({
      label: 'Tue',
      tip: 'Due Tuesday',
      overdue: false,
    });
    expect(dueLabel('2026-10-16', SUNDAY)).toMatchObject({
      label: 'Fri',
      tip: 'Was due Friday',
      overdue: true,
    });
  });

  it('C03-U30 across a month and a year', () => {
    expect(dueLabel('2027-01-01', '2026-12-31').label).toBe('tomorrow');
    expect(dueLabel('2026-02-28', '2026-03-01').label).toBe('yesterday');
    expect(dueLabel('2026-03-01', '2026-02-28').label).toBe('tomorrow');
  });
});

describe('C02-U66 due today is its own flag (#121)', () => {
  it('C02-U66 today is true only for the day itself; tomorrow, yesterday and further are false', () => {
    expect(dueLabel(SUNDAY, SUNDAY).today).toBe(true);
    expect(dueLabel('2026-10-19', SUNDAY).today).toBe(false);
    expect(dueLabel('2026-10-17', SUNDAY).today).toBe(false);
    expect(dueLabel('2026-10-23', SUNDAY).today).toBe(false);
    expect(dueLabel('2026-11-04', SUNDAY).today).toBe(false);
  });

  it('C02-U66 with a time today: amber until the minute passes, then overdue and never both', () => {
    const at = '17:00';
    const before = dueLabelAt(SUNDAY, SUNDAY, at, new Date(2026, 9, 18, 16, 59));
    expect(before).toMatchObject({ today: true, overdue: false });
    const after = dueLabelAt(SUNDAY, SUNDAY, at, new Date(2026, 9, 18, 17, 1));
    expect(after).toMatchObject({ today: false, overdue: true });
    // A time on another day changes nothing about today.
    expect(dueLabelAt('2026-10-19', SUNDAY, at, new Date(2026, 9, 18, 17, 1)).today).toBe(false);
    expect(dueLabelAt(SUNDAY, SUNDAY, null, new Date(2026, 9, 18, 23, 0)).today).toBe(true);
  });
});
