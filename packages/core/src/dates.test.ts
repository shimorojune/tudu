import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateLabel,
  dayEyebrow,
  dayHeading,
  daysInMonth,
  diffDays,
  dueDistance,
  formatDay,
  formatLong,
  isIsoDate,
  isoToday,
  isoWeekNumber,
  isoWeekYear,
  mondayOf,
  relativeDayLabel,
  weekDays,
  weekRange,
  weekdayName,
  weekdayOf,
} from './dates';

const TODAY = '2026-10-18'; // a Sunday

describe('ISO days', () => {
  it('accepts real calendar days and rejects the rest', () => {
    expect(isIsoDate('2026-10-18')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-5')).toBe(false);
    expect(isIsoDate(20261018)).toBe(false);
  });

  it('adds and subtracts days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('measures the distance between days in both directions', () => {
    expect(diffDays(TODAY, '2026-10-22')).toBe(4);
    expect(diffDays(TODAY, '2026-10-16')).toBe(-2);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('names the weekday from the string alone, whatever the machine time zone', () => {
    expect(weekdayOf(TODAY)).toBe(0);
    expect(weekdayName(TODAY)).toBe('Sunday');
    expect(weekdayName('2026-10-19')).toBe('Monday');
  });

  it('reads today from a clock in local time', () => {
    expect(isoToday(new Date(2026, 9, 18, 23, 59))).toBe('2026-10-18');
    expect(isoToday(new Date(2026, 9, 19, 0, 0))).toBe('2026-10-19');
  });

  it('knows how long each month is', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 10)).toBe(31);
  });
});

describe('C00-U34 relative day labels', () => {
  it('says Today, Tomorrow and Yesterday', () => {
    expect(relativeDayLabel(TODAY, TODAY)).toBe('Today');
    expect(relativeDayLabel('2026-10-19', TODAY)).toBe('Tomorrow');
    expect(relativeDayLabel('2026-10-17', TODAY)).toBe('Yesterday');
  });
  it('counts days further out', () => {
    expect(relativeDayLabel('2026-10-21', TODAY)).toBe('In 3 days');
    expect(relativeDayLabel('2026-10-11', TODAY)).toBe('7 days ago');
  });
  it('builds the eyebrow and heading of a day sheet', () => {
    expect(dayEyebrow(TODAY, TODAY)).toBe('Today · Week 42');
    expect(dayEyebrow('2026-10-19', TODAY)).toBe('Tomorrow · Week 43');
    expect(dayHeading('2026-10-19', TODAY)).toEqual({
      eyebrow: 'Tomorrow · Week 43',
      day: 'Monday',
      date: '19 October',
      isToday: false,
    });
  });
  it('formats days for bylines and pickers', () => {
    expect(formatDay('2026-10-19')).toBe('Mon 19 Oct');
    expect(formatLong('2026-10-19')).toBe('Monday 19 October');
    expect(dateLabel('2026-10-05')).toBe('5 October');
  });
});

describe('C00-U35 due distance', () => {
  it('says today, tomorrow and in N days', () => {
    expect(dueDistance(TODAY, TODAY)).toEqual({ text: 'today', tone: 'today' });
    expect(dueDistance('2026-10-19', TODAY)).toEqual({ text: 'tomorrow', tone: '' });
    expect(dueDistance('2026-10-22', TODAY)).toEqual({ text: 'in 4 days', tone: '' });
  });
  it('switches to weeks from two weeks out', () => {
    expect(dueDistance('2026-11-01', TODAY).text).toBe('in 2 weeks');
    expect(dueDistance('2026-11-08', TODAY).text).toBe('in 3 weeks');
    expect(dueDistance('2026-10-31', TODAY).text).toBe('in 13 days');
  });
  it('says how overdue, in red', () => {
    expect(dueDistance('2026-10-17', TODAY)).toEqual({ text: '1 day overdue', tone: 'overdue' });
    expect(dueDistance('2026-10-16', TODAY)).toEqual({ text: '2 days overdue', tone: 'overdue' });
    expect(dueDistance('2026-10-04', TODAY)).toEqual({ text: '2 weeks overdue', tone: 'overdue' });
  });
});

describe('C00-U36 ISO weeks', () => {
  it('numbers weeks the ISO way, Monday first', () => {
    expect(isoWeekNumber('2026-10-18')).toBe(42);
    expect(isoWeekNumber('2026-10-19')).toBe(43);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
  });
  it('handles the year boundary', () => {
    expect(isoWeekNumber('2024-12-30')).toBe(1);
    expect(isoWeekYear('2024-12-30')).toBe(2025);
    expect(isoWeekNumber('2027-01-03')).toBe(53);
    expect(isoWeekYear('2027-01-03')).toBe(2026);
  });
  it('finds the Monday and the Monday to Sunday range', () => {
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
    expect(weekRange('2026-10-21')).toEqual({ monday: '2026-10-19', sunday: '2026-10-25' });
    expect(weekDays('2026-10-21')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });
});
