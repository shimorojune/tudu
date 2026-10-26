import { describe, expect, it } from 'vitest';
import { addedWords, fileSize, landsWords, linkedWords, pagePlannedDay, taskFromWords } from './quickadd';
import { TITLE_MAX } from './tasks';

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

describe('C06-U08 where Quick Add plans a task by default', () => {
  const at = { shownDay: '2026-10-20', monday: '2026-10-26', today: '2026-10-18' };
  it('is empty on the Backlog, so the task lands there, and the foot says so', () => {
    expect(pagePlannedDay('backlog', at)).toBeNull();
    expect(landsWords({ planned: null }, at.today)).toEqual({
      pre: 'Lands in ',
      where: 'Backlog',
      extra: '',
    });
  });
  it('keeps Today and the week as they were', () => {
    expect(pagePlannedDay('today', at)).toBe('2026-10-20');
    expect(pagePlannedDay(null, at)).toBe('2026-10-20');
    expect(pagePlannedDay('week', at)).toBe('2026-10-26');
    expect(pagePlannedDay('week', { ...at, monday: '2026-10-12' })).toBe('2026-10-18');
  });
});

describe('C22-U23 a task from words selected in a note', () => {
  it('C22-U23 one line is the title and nothing goes in the note', () => {
    expect(taskFromWords('  Call the venue   about parking ')).toEqual({
      title: 'Call the venue about parking',
      note: '',
    });
  });

  it('C22-U23 the first line is the title, every other line a paragraph of the note; blank lines fold away', () => {
    expect(taskFromWords('Call the venue\n\n  Ask Meera for the headcount\nBook the train\n')).toEqual({
      title: 'Call the venue',
      note: '<p>Ask Meera for the headcount</p><p>Book the train</p>',
    });
  });

  it('C22-U23 a line past the title limit is cut at a word, the rest leading the note', () => {
    const word = 'venue ';
    const long = word.repeat(100).trim();
    const t = taskFromWords(`${long}\nNext line`);
    expect(t.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.title.length).toBeGreaterThan(TITLE_MAX / 2);
    expect(t.title.endsWith('venue')).toBe(true);
    const rest = long.slice(t.title.length).trim();
    expect(t.note).toBe(`<p>${rest}</p><p>Next line</p>`);
  });

  it('C22-U23 the note is escaped; nothing selected gives no title', () => {
    expect(taskFromWords('Fix it\n<b>x</b> & y').note).toBe('<p>&lt;b&gt;x&lt;/b&gt; &amp; y</p>');
    expect(taskFromWords('  \n ')).toEqual({ title: '', note: '' });
  });

  it('C22-U23 the toast says where it went and that it is linked', () => {
    expect(linkedWords('Call the venue', SUNDAY, SUNDAY, 'Personal')).toBe(
      '‘Call the venue’ is on Today in Personal, linked to this note.',
    );
    expect(linkedWords('Call the venue', null, SUNDAY, 'Northwind')).toBe(
      '‘Call the venue’ is in the Backlog in Northwind, linked to this note.',
    );
    expect(linkedWords('x'.repeat(80), SUNDAY, SUNDAY, 'Personal')).toContain(`‘${'x'.repeat(59)}…’`);
  });
});
