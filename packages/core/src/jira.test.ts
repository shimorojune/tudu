import { describe, expect, it } from 'vitest';
import {
  acrossWords,
  historyWords,
  issueUrl,
  jiraCount,
  jiraCountWords,
  jiraDueWords,
  linkChipWords,
  linkDayLong,
  linkDayShort,
  linkFootWords,
  linksByKey,
  matchScore,
  normalSite,
  parseJiraKey,
  siteHost,
  siteProblem,
  syncMutationSchema,
  syncedWords,
  type JiraLink,
} from './index';

const SUN = '2026-10-18';
const at = '2026-10-18T10:00:00.000Z';

describe('Jira words (chunk 10)', () => {
  it('C10-U01 keys, counts, due and linked words, the mutations, history and search by key', () => {
    // A key in full, uppercased; anything else is not one.
    expect(parseJiraKey(' tudu-212 ')).toBe('TUDU-212');
    expect(parseJiraKey('OPS_2-14')).toBe('OPS_2-14');
    for (const bad of ['TUDU', '212', 'TUDU-', '-1', 'TUDU 212', 'T-1', '1AB-2'])
      expect(parseJiraKey(bad)).toBeNull();

    expect(jiraCountWords(5)).toBe('5 assigned to you, not in Tudu yet');
    expect(acrossWords(1)).toBe('1 issue across Jira');
    expect(acrossWords(7)).toBe('7 issues across Jira');

    // The byline's due words.
    expect(jiraDueWords(SUN, SUN)).toEqual({ text: 'Due today', overdue: false });
    expect(jiraDueWords('2026-10-22', SUN)).toEqual({ text: 'Due Thu', overdue: false });
    expect(jiraDueWords('2026-11-04', SUN)).toEqual({ text: 'Due 4 Nov', overdue: false });
    expect(jiraDueWords('2026-10-12', SUN)).toEqual({ text: 'Overdue since Mon', overdue: true });

    // The linked chip: where the task sits, short; its name; the preview's foot.
    expect(linkDayShort(SUN, SUN)).toBe('Today');
    expect(linkDayShort('2026-10-19', SUN)).toBe('Tomorrow');
    expect(linkDayShort('2026-10-22', SUN)).toBe('Thu');
    expect(linkDayShort('2026-10-30', SUN)).toBe('30 Oct');
    expect(linkDayShort('2026-10-16', SUN)).toBe('16 Oct');
    expect(linkDayShort(null, SUN)).toBe('Backlog');
    expect(linkDayLong('2026-10-22', SUN)).toBe('Thu 22 Oct');
    expect(linkDayLong(null, SUN)).toBe('the Backlog');
    expect(linkChipWords({ ref: 'ME-52', day: SUN, done: false }, SUN)).toEqual({
      text: 'ME-52 · Today',
      label: 'Show the linked task ME-52 on Today',
    });
    expect(linkChipWords({ ref: 'ME-53', day: null, done: true }, SUN)).toEqual({
      text: 'ME-53 · Backlog',
      label: 'Show the linked task ME-53 in the Backlog, crossed off',
    });
    expect(linkChipWords({ ref: null, day: '2026-10-19', done: false }, SUN).text).toBe('Tomorrow');
    expect(linkFootWords({ day: SUN, done: false }, SUN)).toBe(
      'This issue already has a Tudu task, on Today.',
    );
    expect(linkFootWords({ day: null, done: false }, SUN)).toBe(
      'This issue already has a Tudu task, in the Backlog.',
    );
    expect(linkFootWords({ day: SUN, done: true }, SUN)).toBe('Its Tudu task is done.');

    // The header's time of Jira's last answer.
    const now = new Date('2026-10-18T10:30:00.000Z');
    expect(syncedWords(null, now)).toBeNull();
    expect(syncedWords('2026-10-18T10:29:40.000Z', now)).toBe('just now');
    expect(syncedWords('2026-10-18T10:18:00.000Z', now)).toBe('12 min ago');
    expect(syncedWords('2026-10-18T08:30:00.000Z', now)).toBe('2 hours ago');
    expect(syncedWords('2026-10-17T09:00:00.000Z', now)).toBe('yesterday');

    // The address: checked before anything is sent, kept without its trailing slash.
    expect(siteProblem('')).toMatch(/Add your Jira address/);
    expect(siteProblem('jira.northwind.io')).toMatch(/doesn’t look like a web address/);
    expect(siteProblem('https://jira')).toMatch(/doesn’t look like a web address/);
    expect(siteProblem('https://jira.northwind.io')).toBeNull();
    expect(siteProblem('http://localhost:3456/__test/jira')).toBeNull();
    expect(normalSite('https://jira.northwind.io/ ')).toBe('https://jira.northwind.io');
    expect(siteHost('https://jira.northwind.io')).toBe('jira.northwind.io');
    expect(issueUrl('https://jira.northwind.io/', 'TUDU-1')).toBe('https://jira.northwind.io/browse/TUDU-1');

    // The count: assigned issues less those with an open task; a crossed-off task counts again.
    const links: Array<Pick<JiraLink, 'key' | 'done'>> = [
      { key: 'A-1', done: false },
      { key: 'A-2', done: true },
      { key: 'Z-9', done: false },
    ];
    expect(jiraCount(['A-1', 'A-2', 'A-3'], links)).toBe(2);
    const l = (key: string, taskId: string, done: boolean): JiraLink => ({
      key,
      taskId,
      ref: null,
      title: '',
      day: null,
      done,
    });
    expect(
      linksByKey([l('A-1', 't1', true), l('A-1', 't2', false)])
        .get('A-1')!
        .map((x) => x.taskId),
    ).toEqual(['t2', 't1']);

    // The mutations: a create linked to a key, and task.jira to link and unlink; a key is uppercased, junk refused.
    const create = syncMutationSchema.parse({
      id: 'm1',
      at,
      type: 'task.create',
      payload: {
        id: 't',
        spaceId: 's',
        title: 'x',
        day: SUN,
        position: null,
        jira: 'tudu-1',
        source: 'jira',
      },
    });
    expect(create.type === 'task.create' && create.payload.jira).toBe('TUDU-1');
    expect(
      syncMutationSchema.parse({ id: 'm2', at, type: 'task.jira', payload: { id: 't', jira: null } }).type,
    ).toBe('task.jira');
    expect(
      syncMutationSchema.safeParse({ id: 'm3', at, type: 'task.jira', payload: { id: 't', jira: 'no key' } })
        .success,
    ).toBe(false);

    // History lines.
    expect(historyWords({ id: 1, at, kind: 'created', source: 'jira', key: 'TUDU-212' }, SUN)).toBe(
      'Created from TUDU-212',
    );
    expect(historyWords({ id: 2, at, kind: 'jira.linked', key: 'OPS-14' }, SUN)).toBe('Linked to OPS-14');
    expect(historyWords({ id: 3, at, kind: 'jira.unlinked', key: 'OPS-14' }, SUN)).toBe('Unlinked OPS-14');

    // Search: a key typed in full is the top hit; the key's parts match as words.
    const task = { ref: 'ME-5', title: 'Fix the picker', done: false, jira: 'TUDU-219' };
    expect(matchScore(task, 'tudu-219')!.score).toBe(100);
    expect(matchScore(task, 'tudu')).not.toBeNull();
    expect(matchScore({ ...task, jira: null }, 'tudu')).toBeNull();
  });
});
