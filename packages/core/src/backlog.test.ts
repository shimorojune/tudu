import { describe, expect, it } from 'vitest';
import { backlogCount, splitBacklog } from './backlog';

describe('C06-U06 Backlog words', () => {
  it('counts the view, and says Nothing waiting', () => {
    expect(backlogCount(4, 'open')).toBe('4 tasks');
    expect(backlogCount(1, 'open')).toBe('1 task');
    expect(backlogCount(0, 'open')).toBe('Nothing waiting');
    expect(backlogCount(3, 'done')).toBe('3 crossed off');
    expect(backlogCount(1, 'done')).toBe('1 crossed off');
    expect(backlogCount(0, 'done')).toBe('Nothing crossed off');
  });

  it('splits To do in its own order from Crossed off newest first', () => {
    const t = (id: string, done: boolean, doneAt: string | null, updatedAt = '2026-10-10T00:00:00Z') => ({
      id,
      number: id.charCodeAt(0),
      done,
      doneAt,
      updatedAt,
    });
    const { open, done } = splitBacklog([
      t('a', false, null),
      t('b', true, '2026-10-18T09:00:00Z'),
      t('c', false, null),
      t('d', true, '2026-10-19T09:00:00Z'),
      t('e', true, null, '2026-10-17T09:00:00Z'),
      // the same moment (a fixed clock): the later change, then the newer task
      t('f', true, '2026-10-19T09:00:00Z', '2026-10-19T09:00:01Z'),
      t('g', true, '2026-10-19T09:00:00Z', '2026-10-19T09:00:01Z'),
    ]);
    expect(open.map((x) => x.id)).toEqual(['a', 'c']);
    expect(done.map((x) => x.id)).toEqual(['g', 'f', 'd', 'b', 'e']);
  });
});
