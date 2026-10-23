import { describe, expect, it } from 'vitest';
import { nextProjectColor, PROJECT_COLORS, projectDeletedWords, projectNameSchema } from './projects';

describe('C04-U16 project colours and names', () => {
  it('C04-U16 hands out the palette in order, skipping colours already taken, then round again', () => {
    expect(nextProjectColor([])).toBe(PROJECT_COLORS[0]);
    expect(nextProjectColor([PROJECT_COLORS[0]])).toBe(PROJECT_COLORS[1]);
    expect(nextProjectColor([PROJECT_COLORS[0], PROJECT_COLORS[2]])).toBe(PROJECT_COLORS[1]);
    expect(nextProjectColor([...PROJECT_COLORS])).toBe(PROJECT_COLORS[0]);
    expect(nextProjectColor([...PROJECT_COLORS, PROJECT_COLORS[0]])).toBe(PROJECT_COLORS[1]);
    expect(nextProjectColor(['#3D5A80'])).toBe(PROJECT_COLORS[1]);
  });

  it('C04-U16 trims names and keeps them between 1 and 60 characters', () => {
    expect(projectNameSchema.parse('  Platform ')).toBe('Platform');
    expect(projectNameSchema.safeParse('   ').success).toBe(false);
    expect(projectNameSchema.safeParse('x'.repeat(61)).success).toBe(false);
    expect(projectNameSchema.safeParse('x'.repeat(60)).success).toBe(true);
  });
});

describe('projectDeletedWords', () => {
  it('C18-U06 the delete toast says what happened to the tasks: none, one, three', () => {
    expect(projectDeletedWords('Offsite', 0)).toBe('Offsite deleted.');
    expect(projectDeletedWords('Hiring', 1)).toBe('Hiring deleted. Its task keeps no project.');
    expect(projectDeletedWords('Platform', 3)).toBe('Platform deleted. Its 3 tasks keep no project.');
  });
});
