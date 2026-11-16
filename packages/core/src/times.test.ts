import { describe, expect, it } from 'vitest';
import {
  blockFrom,
  blockOk,
  byPlaceOn,
  fmtBlock,
  fmtTime,
  isPast,
  moveSpan,
  nextFullHour,
  onDay,
  placeOn,
  spanDays,
  spanFact,
  spanList,
  spanOf,
  spanPill,
  spanTimeWords,
  spanWords,
  SPAN_TOP,
} from './times';
import { dueLabelAt } from './due';
import { spanOk } from './tasks';

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m);

describe('times (docs/plans/task-times.md)', () => {
  it('TT-U01 time words, blocks and the next full hour', () => {
    expect(fmtTime('15:00')).toBe('3 PM');
    expect(fmtTime('15:30')).toBe('3:30 PM');
    expect(fmtTime('00:00')).toBe('12 AM');
    expect(fmtTime('12:05')).toBe('12:05 PM');
    expect(fmtTime('15:00', { hour24: true })).toBe('15:00');
    expect(fmtBlock({ start: '15:00', end: '16:00' })).toBe('3 to 4 PM');
    expect(fmtBlock({ start: '11:00', end: '13:00' })).toBe('11 AM to 1 PM');
    expect(fmtBlock({ start: '09:30', end: '10:00' })).toBe('9:30 to 10 AM');
    expect(fmtBlock({ start: '15:00', end: '16:00' }, { hour24: true })).toBe('15:00–16:00');
    expect(nextFullHour(at(14, 10))).toBe('15:00');
    expect(nextFullHour(at(23, 20))).toBe('23:00');
    expect(blockFrom('15:00')).toEqual({ start: '15:00', end: '16:00' });
    expect(blockFrom('23:30')).toEqual({ start: '23:30', end: '23:59' });
    expect(blockOk({ start: '15:00', end: '16:00' })).toBe(true);
    expect(blockOk({ start: '16:00', end: '15:00' })).toBe(false);
    expect(blockOk({ start: '16:00', end: '15:00' }, true)).toBe(true);
    expect(blockOk({ start: 'x', end: '15:00' }, true)).toBe(false);
    expect(blockOk(null)).toBe(true);
    expect(isPast('2026-10-21', '17:00', at(16, 59))).toBe(false);
    expect(isPast('2026-10-21', '17:00', at(17, 0))).toBe(true);
    expect(isPast('2026-10-20', '23:00', at(1))).toBe(true);
    expect(isPast('2026-10-22', '01:00', at(23))).toBe(false);
  });

  it('TT-U20 a span knows when the day shown is today (#116)', () => {
    expect(spanOf('2026-10-17', '2026-10-20', '2026-10-18', '2026-10-18')).toEqual({
      from: '2026-10-17',
      until: '2026-10-20',
      n: 2,
      of: 4,
      today: true,
    });
    expect(spanOf('2026-10-17', '2026-10-20', '2026-10-19', '2026-10-18')?.today).toBe(false);
    expect(spanOf('2026-10-17', '2026-10-20', '2026-10-19')?.today).toBeUndefined();
  });

  it('TT-U02 where a day falls in a span, its length across a month, and a move keeps the length', () => {
    expect(spanOf('2026-10-18', '2026-10-21', '2026-10-18')).toEqual({
      from: '2026-10-18',
      until: '2026-10-21',
      n: 1,
      of: 4,
    });
    expect(spanOf('2026-10-18', '2026-10-21', '2026-10-20')?.n).toBe(3);
    expect(spanOf('2026-10-18', '2026-10-21', '2026-10-21')?.n).toBe(4);
    expect(spanOf('2026-10-18', '2026-10-21', '2026-10-22')).toBeNull();
    expect(spanOf('2026-10-18', null, '2026-10-18')).toBeNull();
    expect(spanDays('2026-10-31', '2026-11-02')).toBe(3);
    expect(spanList('2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(spanList('2026-10-31', null)).toEqual(['2026-10-31']);
    expect(spanList('2026-10-01', '2026-12-31')).toHaveLength(31);
    expect(moveSpan('2026-10-18', '2026-10-21', '2026-10-30')).toEqual({
      day: '2026-10-30',
      until: '2026-11-02',
    });
    expect(onDay('2026-10-18', '2026-10-21', '2026-10-19')).toBe(true);
    expect(onDay('2026-10-18', null, '2026-10-19')).toBe(false);
    expect(onDay(null, null, null)).toBe(true);
    expect(spanOk('2026-10-18', '2026-10-21')).toBe(true);
    expect(spanOk('2026-10-18', '2026-10-18')).toBe(false);
    expect(spanOk(null, '2026-10-18')).toBe(false);
    expect(spanOk('2026-10-01', '2026-10-31')).toBe(true);
    expect(spanOk('2026-10-01', '2026-11-01')).toBe(false);
    expect(spanWords('2026-10-18', '2026-10-21')).toBe('Sun 18 to Wed 21 Oct');
    expect(spanWords('2026-10-31', '2026-11-02')).toBe('Sat 31 Oct to Mon 2 Nov');
    expect(spanFact('2026-10-18', '2026-10-21', { start: '16:00', end: '18:00' })).toBe(
      'Sun 18, 4 PM to Wed 21 Oct, 6 PM',
    );
  });

  it('TT-U03 a span shows its start on the first day, its end on the last, nothing between', () => {
    const time = { start: '10:00', end: '17:00' };
    const place = (n: number) => ({ from: '2026-10-18', until: '2026-10-21', n, of: 4 });
    expect(spanTimeWords(time, place(1))).toBe('from 10 AM');
    expect(spanTimeWords(time, place(2))).toBe('');
    expect(spanTimeWords(time, place(4))).toBe('until 5 PM');
    expect(spanTimeWords(null, place(1))).toBe('');
    expect(spanPill(time, place(2))).toBe('Day 2 of 4');
    expect(spanPill(time, place(4))).toBe('Day 4 of 4 · until 5 PM');
    expect(spanPill(time, place(3), true)).toBe('3/4');
  });

  it('TT-U04 the due pill with a time turns overdue at its minute, not at midnight', () => {
    const today = '2026-10-21';
    expect(dueLabelAt(today, today, '17:00', at(16, 59))).toMatchObject({
      label: 'today 5 PM',
      overdue: false,
    });
    expect(dueLabelAt(today, today, '17:00', at(17, 0))).toMatchObject({ label: '5 PM', overdue: true });
    expect(dueLabelAt('2026-10-22', today, '09:00', at(10))).toMatchObject({
      label: 'tomorrow 9 AM',
      overdue: false,
    });
    expect(dueLabelAt('2026-10-20', today, '09:00', at(10))).toMatchObject({
      label: 'yesterday',
      overdue: true,
    });
    expect(dueLabelAt(today, today, null, at(23))).toMatchObject({ label: 'today', overdue: false });
  });

  it('a span sits at the top of its later days unless given a place there', () => {
    const t = (id: string, day: string, position: number, places = {}) => ({
      id,
      day,
      position,
      places,
      createdAt: `2026-10-0${id}`,
    });
    const own = t('1', '2026-10-19', 100);
    const span = t('2', '2026-10-18', 5);
    expect(placeOn(span, '2026-10-19')).toBe(SPAN_TOP);
    expect(placeOn(span, '2026-10-18')).toBe(5);
    expect([own, span].sort(byPlaceOn('2026-10-19')).map((x) => x.id)).toEqual(['2', '1']);
    const placed = t('2', '2026-10-18', 5, { '2026-10-19': 200 });
    expect([placed, own].sort(byPlaceOn('2026-10-19')).map((x) => x.id)).toEqual(['1', '2']);
  });
});
