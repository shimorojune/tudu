import type { Task } from '@tudu/core';
import { describe, expect, it } from 'vitest';
import { toItem } from './TodayPage';

const span = {
  id: 't1',
  ref: 'ME-65',
  title: 'Plan the team offsite agenda',
  day: '2026-10-17',
  until: '2026-10-20',
  done: false,
  due: null,
  carriedFrom: null,
  projectId: null,
  commentCount: 0,
  jira: null,
  subtasks: [],
} as unknown as Task;

describe('toItem spans (docs/plans/span-today.md)', () => {
  it('TT-U22 a span that started before today: on today’s sheet it is today’s, on tomorrow’s it is not', () => {
    const today = '2026-10-18';
    const onToday = toItem(span, today, [], undefined, { day: today })!;
    expect(onToday.span).toMatchObject({ n: 2, of: 4, today: true });
    const onTomorrow = toItem(span, today, [], undefined, { day: '2026-10-19' })!;
    expect(onTomorrow.span).toMatchObject({ n: 3, of: 4, today: false });
  });
});
