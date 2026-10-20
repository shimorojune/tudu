import { describe, expect, it } from 'vitest';
import { addedWords, fileSize, landsWords } from './quickadd';

const SUNDAY = '2026-10-18';

describe('C04-U17 the foot of Quick Add', () => {
  it('C04-U17 says where the task lands', () => {
    expect(landsWords({ planned: SUNDAY }, SUNDAY)).toEqual({ pre: 'Lands on ', where: 'Today', extra: '' });
    expect(landsWords({ planned: '2026-10-19' }, SUNDAY).where).toBe('Tomorrow');
    expect(landsWords({ planned: '2026-10-22' }, SUNDAY).where).toBe('Thu 22 Oct');
    expect(landsWords({ planned: null }, SUNDAY)).toEqual({ pre: 'Lands in ', where: 'Backlog', extra: '' });
  });

  it('C04-U17 lists what goes with it: project, due, note, files', () => {
    expect(
      landsWords(
        { planned: SUNDAY, projectName: 'Platform', due: '2026-10-22', note: 'Keep it short', files: 2 },
        SUNDAY,
      ).extra,
    ).toBe('Platform · due Thu 22 Oct · note · 2 files');
    expect(landsWords({ planned: SUNDAY, files: 1, note: '  ' }, SUNDAY).extra).toBe('1 file');
  });

  it('C04-U17 the toast and file sizes', () => {
    expect(addedWords('2026-10-19', SUNDAY)).toBe('Added to Tomorrow');
    expect(addedWords(null, SUNDAY)).toBe('Added to Backlog');
    expect(fileSize(248_000)).toBe('242 KB');
    expect(fileSize(1_260_000)).toBe('1.2 MB');
    expect(fileSize(10)).toBe('1 KB');
  });
});
