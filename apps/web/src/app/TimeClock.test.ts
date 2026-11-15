import type { Task } from '@tudu/core';
import { describe, expect, it } from 'vitest';
import { MAX_NOTICES, timeNotices } from './TimeClock';

const base: Task = {
  id: 't1',
  spaceId: 's',
  number: 1,
  ref: 'ME-1',
  title: 'Quick Add demo',
  day: '2026-10-18',
  position: 0,
  done: false,
  doneAt: null,
  carriedFrom: null,
  due: null,
  visibility: 'space',
  projectId: null,
  links: [],
  jira: null,
  ownerId: 'me',
  subtasks: [],
  subsDone: 0,
  subsTotal: 0,
  commentCount: 0,
  createdAt: '',
  updatedAt: '',
};
const NOW = new Date(2026, 9, 18, 14, 10);
const place = () => 'Northwind';

describe('TimeClock', () => {
  it('TT-U18 the next 48 hours: starts and due times, nearest first, words as the plan says', () => {
    const tasks: Task[] = [
      { ...base, id: 'a', time: { start: '15:00', end: '15:30' } },
      { ...base, id: 'b', title: 'Send the contract', due: '2026-10-18', dueAt: '17:00' },
      { ...base, id: 'c', day: '2026-10-21', time: { start: '09:00', end: '10:00' } },
    ];
    const n = timeNotices(tasks, NOW, 'me', place);
    expect(n.map((x) => `${x.taskId}.${x.kind}`)).toEqual(['a.start', 'b.due']);
    expect(n[0]).toMatchObject({ title: 'Starts now: Quick Add demo', body: '3 to 3:30 PM · Northwind' });
    expect(n[1]).toMatchObject({
      title: 'Due now: Send the contract',
      body: 'Due today at 5 PM · Northwind',
    });
    expect(n[0]!.atMs).toBe(new Date(2026, 9, 18, 15, 0).getTime());
  });

  it('TT-U18 crossed off, someone else’s and gone by are skipped; a span once, at its start', () => {
    const tasks: Task[] = [
      { ...base, id: 'done', done: true, time: { start: '15:00', end: '16:00' } },
      { ...base, id: 'theirs', ownerId: 'you', time: { start: '15:00', end: '16:00' } },
      { ...base, id: 'gone', time: { start: '13:00', end: '14:00' } },
      { ...base, id: 'span', day: '2026-10-19', until: '2026-10-22', time: { start: '10:00', end: '17:00' } },
    ];
    const n = timeNotices(tasks, NOW, 'me', place);
    expect(n.map((x) => x.taskId)).toEqual(['span']);
    expect(n[0]!.body).toBe('10 AM, every day until Thu 22 Oct · Northwind');
  });

  it('TT-U18 the nearest 60 only', () => {
    const tasks: Task[] = Array.from({ length: 80 }, (_, i) => ({
      ...base,
      id: `t${i}`,
      day: '2026-10-19',
      time: {
        start: `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
        end: '23:59',
      },
    }));
    const n = timeNotices(tasks, NOW, 'me', place);
    expect(n).toHaveLength(MAX_NOTICES);
    expect(n[0]!.taskId).toBe('t0');
  });

  it('TT-U18 24-hour words when the system says so', () => {
    const n = timeNotices([{ ...base, time: { start: '15:00', end: '16:00' } }], NOW, 'me', place, {
      hour24: true,
    });
    expect(n[0]!.body).toBe('15:00–16:00 · Northwind');
  });
});
