import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOURS,
  hoursLine,
  hoursOn,
  nextWorkDay,
  parseWorkHours,
  workHoursOf,
  type WorkHours,
} from './hours';

const per = (days: Array<[number, string, string]>, same = false): WorkHours => ({
  days: days.map(([day, start, end]) => ({ day, start, end })),
  same,
});

describe('WH-U01 parseWorkHours', () => {
  it('WH-U01 keeps the default and per-day hours, in day order, with same as sent', () => {
    expect(parseWorkHours(DEFAULT_HOURS)).toEqual({ ok: true, hours: DEFAULT_HOURS });
    const r = parseWorkHours(
      per([
        [5, '09:00', '14:00'],
        [1, '08:30', '17:00'],
      ]),
    );
    expect(r).toEqual({
      ok: true,
      hours: per([
        [1, '08:30', '17:00'],
        [5, '09:00', '14:00'],
      ]),
    });
  });

  it('WH-U01 refuses an end not after the start, no days, bad times, a day twice and unknown keys', () => {
    expect(parseWorkHours(per([[1, '18:00', '09:00']]))).toEqual({ ok: false, problem: 'end-before-start' });
    expect(parseWorkHours(per([[1, '09:00', '09:00']]))).toEqual({ ok: false, problem: 'end-before-start' });
    expect(parseWorkHours({ days: [], same: true })).toEqual({ ok: false, problem: 'no-days' });
    expect(parseWorkHours(per([[1, '25:00', '26:00']]))).toEqual({ ok: false, problem: 'bad-time' });
    expect(parseWorkHours(per([[1, '9:5', '18:00']]))).toEqual({ ok: false, problem: 'bad-time' });
    expect(
      parseWorkHours(
        per([
          [1, '09:00', '18:00'],
          [1, '10:00', '11:00'],
        ]),
      ),
    ).toEqual({
      ok: false,
      problem: 'bad-shape',
    });
    expect(parseWorkHours(per([[8, '09:00', '18:00']]))).toEqual({ ok: false, problem: 'bad-shape' });
    expect(parseWorkHours({ ...DEFAULT_HOURS, tz: 'UTC' })).toEqual({ ok: false, problem: 'bad-shape' });
    expect(parseWorkHours(null)).toEqual({ ok: false, problem: 'bad-shape' });
  });

  it('WH-U01 a missing or unreadable stored value reads as the default', () => {
    expect(workHoursOf(null)).toBe(DEFAULT_HOURS);
    expect(workHoursOf({ days: 'x' })).toBe(DEFAULT_HOURS);
  });
});

describe('WH-U02 hoursLine', () => {
  it('WH-U02 one stretch, every day, a short Friday, a single day', () => {
    expect(hoursLine(DEFAULT_HOURS)).toBe('Mon to Fri, 09:00 to 18:00');
    expect(
      hoursLine(
        per(
          [1, 2, 3, 4, 5, 6, 7].map((d) => [d, '09:00', '18:00'] as [number, string, string]),
          true,
        ),
      ),
    ).toBe('Every day, 09:00 to 18:00');
    expect(
      hoursLine(
        per([
          [1, '09:00', '18:00'],
          [2, '09:00', '18:00'],
          [3, '09:00', '18:00'],
          [4, '09:00', '18:00'],
          [5, '09:00', '14:00'],
        ]),
      ),
    ).toBe('Mon to Thu 09:00 to 18:00, Fri 09:00 to 14:00');
    expect(hoursLine(per([[3, '10:00', '12:00']], true))).toBe('Wed, 10:00 to 12:00');
    expect(
      hoursLine(
        per(
          [
            [1, '09:00', '18:00'],
            [3, '09:00', '18:00'],
          ],
          true,
        ),
      ),
    ).toBe('Mon, Wed, 09:00 to 18:00');
  });

  it('WH-U02 the day of an ISO date and the next working day over a weekend', () => {
    // 2026-10-30 is a Friday, 2026-10-31 a Saturday.
    expect(hoursOn(DEFAULT_HOURS, '2026-10-30')).toEqual({ start: 540, end: 1080 });
    expect(hoursOn(DEFAULT_HOURS, '2026-10-31')).toBeNull();
    expect(nextWorkDay(DEFAULT_HOURS, '2026-10-30')).toBe('2026-11-02');
  });
});
