import { describe, expect, it } from 'vitest';
import {
  tileCount,
  tileEyebrow,
  tileEyebrowShort,
  tileLabel,
  tilePreview,
  weekFirstOpen,
  weekHeading,
  weekPlannedDay,
  weekWord,
} from './week';

const SUN = '2026-10-18'; // a Sunday, the last day of week 42 (Mon 12 to Sun 18)

describe('C05-U12 week words and headings', () => {
  it('names the week relative to today', () => {
    expect(weekWord('2026-10-12', SUN)).toBe('This week');
    expect(weekWord('2026-10-19', SUN)).toBe('Next week');
    expect(weekWord('2026-10-05', SUN)).toBe('Last week');
    expect(weekWord('2026-10-26', SUN)).toBe('In 2 weeks');
    expect(weekWord('2026-09-28', SUN)).toBe('2 weeks ago');
    expect(weekWord('2026-09-21', SUN)).toBe('3 weeks ago');
  });

  it('heads the sheet with the range, the month and the week number', () => {
    expect(weekHeading('2026-10-12', SUN)).toEqual({
      eyebrow: 'This week · Week 42',
      word: 'This week',
      day: '12 – 18',
      date: 'October',
      number: 42,
      isThisWeek: true,
    });
    expect(weekHeading('2026-10-19', SUN)).toMatchObject({
      eyebrow: 'Next week · Week 43',
      day: '19 – 25',
      date: 'October',
      isThisWeek: false,
    });
  });

  it('says both months when the week crosses one, and no month beside it', () => {
    expect(weekHeading('2026-09-28', SUN)).toMatchObject({ day: '28 Sep – 4 Oct', date: '' });
    expect(weekHeading('2026-12-28', SUN)).toMatchObject({ day: '28 Dec – 3 Jan', date: '', number: 53 });
  });
});

describe('C05-U13 tile words', () => {
  it('eyebrows a day relative to today, long and short', () => {
    expect(tileEyebrow(SUN, SUN)).toBe('Today');
    expect(tileEyebrow('2026-10-19', SUN)).toBe('Tomorrow');
    expect(tileEyebrow('2026-10-17', SUN)).toBe('Yesterday');
    expect(tileEyebrow('2026-10-21', SUN)).toBe('In 3 days');
    expect(tileEyebrow('2026-10-16', SUN)).toBe('2 days ago');
    expect(tileEyebrowShort(SUN, SUN)).toBe('Today');
    expect(tileEyebrowShort('2026-10-19', SUN)).toBe('Tomorrow');
    expect(tileEyebrowShort('2026-10-21', SUN)).toBe('');
    expect(tileEyebrowShort('2026-10-17', SUN)).toBe('');
  });

  it('counts tasks and the crossed-off ones', () => {
    expect(tileCount(0, 0)).toBe('');
    expect(tileCount(1, 0)).toBe('1 task');
    expect(tileCount(3, 0)).toBe('3 tasks');
    expect(tileCount(7, 2)).toBe('2 of 7');
    expect(tileCount(4, 4)).toBe('4 of 4');
  });

  it('previews a folded day in one line', () => {
    expect(tilePreview(['Pay the electricity bill', 'Dentist at 4pm'], 3)).toBe(
      'Pay the electricity bill · Dentist at 4pm',
    );
    expect(tilePreview([], 4)).toBe('All crossed off');
    expect(tilePreview([], 0)).toBe('');
  });

  it('labels a tile for screen readers', () => {
    expect(tileLabel(SUN, SUN)).toBe('Today, Sunday 18 October');
    expect(tileLabel('2026-10-19', SUN)).toBe('Monday 19 October');
  });
});

describe('C05-U14 where New task lands from the week, and which day opens first', () => {
  it('plans for today in this week, the Monday of a later week, today for a week gone by', () => {
    expect(weekPlannedDay('2026-10-12', SUN)).toBe(SUN);
    expect(weekPlannedDay('2026-10-19', SUN)).toBe('2026-10-19');
    expect(weekPlannedDay('2026-11-02', SUN)).toBe('2026-11-02');
    expect(weekPlannedDay('2026-10-05', SUN)).toBe(SUN);
  });

  it('opens today in this week and the first day of any other', () => {
    expect(weekFirstOpen('2026-10-12', SUN)).toBe(SUN);
    expect(weekFirstOpen('2026-10-19', SUN)).toBe('2026-10-19');
    expect(weekFirstOpen('2026-10-05', SUN)).toBe('2026-10-05');
  });
});
