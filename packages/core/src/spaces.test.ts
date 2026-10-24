import { describe, expect, it } from 'vitest';
import {
  dayGroupTitle,
  findPeople,
  firstName,
  groupShared,
  initialsOf,
  membersWords,
  nobodyWords,
  ownerWords,
  parseRef,
  peopleCount,
  personColor,
  personDays,
  RESERVED_SLUGS,
  sharedWords,
  spaceInitials,
  spacePrefix,
  spaceSlug,
} from './index';
import type { Task } from './tasks';

const SUN = '2026-10-18';

function task(id: string, day: string | null, position = 1024): Task {
  return {
    id,
    spaceId: 'nw',
    number: 1,
    ref: `NW-${id}`,
    title: `Task ${id}`,
    day,
    position,
    done: false,
    doneAt: null,
    carriedFrom: null,
    due: null,
    visibility: 'space',
    projectId: null,
    jira: null,
    ownerId: null,
    subtasks: [],
    subsDone: 0,
    subsTotal: 0,
    commentCount: 0,
    createdAt: '',
    updatedAt: '',
  };
}

describe('C08-U01 a space’s prefix, slug and words', () => {
  it('C08-U01 makes a prefix from the name: one word, two words, and a clash grows', () => {
    expect(spacePrefix('Northwind')).toBe('NW');
    expect(spacePrefix('Platform')).toBe('PF');
    expect(spacePrefix('Home')).toBe('HM');
    expect(spacePrefix('Design team')).toBe('DT');
    expect(spacePrefix('Acme Studio Labs')).toBe('AS');
    expect(spacePrefix('Northwind', ['ME', 'NW'])).toBe('NWO');
    expect(spacePrefix('Northwind', ['NW', 'NWO'])).toBe('NWOR');
    expect(spacePrefix('Me', ['ME'])).toBe('ME2');
    expect(spacePrefix('x')).toBe('XX');
    expect(spacePrefix('  ')).toBe('SP');
  });

  it('C08-U01 makes a slug from the name and keeps reserved words and taken slugs clear', () => {
    expect(spaceSlug('Northwind')).toBe('northwind');
    expect(spaceSlug('Design team')).toBe('design-team');
    expect(spaceSlug('  Café & Co!  ')).toBe('cafe-co');
    expect(spaceSlug('Northwind', ['northwind'])).toBe('northwind-2');
    expect(spaceSlug('Northwind', ['northwind', 'northwind-2'])).toBe('northwind-3');
    expect(spaceSlug('Me')).toBe('me-2');
    expect(spaceSlug('Inbox')).toBe('inbox-2');
    expect(RESERVED_SLUGS.has('me')).toBe(true);
    expect(spaceSlug('!!!')).toBe('space');
  });

  it('C08-U01 reads a task ref and the tile’s letters', () => {
    expect(parseRef('NW-12')).toEqual({ prefix: 'NW', number: 12 });
    expect(parseRef(' me-3 ')).toEqual({ prefix: 'ME', number: 3 });
    expect(parseRef('nope')).toBeNull();
    expect(spaceInitials('Northwind')).toBe('N');
    expect(spaceInitials('Design team')).toBe('DT');
    expect(spaceInitials('')).toBe('?');
  });

  it('C08-U01 gives everyone a steady colour and the quiet words', () => {
    expect(personColor('abc')).toBe(personColor('abc'));
    expect(personColor('abc')).toMatch(/^#[0-9a-f]{6}$/);
    expect(membersWords(1)).toBe('Just you');
    expect(membersWords(0)).toBe('Just you');
    expect(membersWords(19)).toBe('19 people');
    expect(peopleCount(19, 'Northwind')).toBe('19 in Northwind');
    expect(sharedWords(23)).toBe('23 shared this week');
    expect(sharedWords(0)).toBe('Nothing shared this week');
    expect(nobodyWords(' Zed ', 'Northwind')).toBe('No one called “Zed” in Northwind.');
    expect(initialsOf('Meera Nair', '')).toBe('MN');
    expect(initialsOf('', 'meera@x.y')).toBe('M');
    expect(firstName('Meera Nair')).toBe('Meera');
    expect(firstName('', 'arjun@x.y')).toBe('arjun');
    expect(ownerWords('2026-10-19', 'Meera Nair', SUN)).toBe('Mon 19 Oct · Meera’s');
    expect(ownerWords(SUN, 'Meera Nair', SUN)).toBe('Today · Sun 18 Oct · Meera’s');
    expect(ownerWords(null, 'Meera', SUN)).toBe('Backlog · Meera’s');
  });
});

describe('C08-U01 People groups', () => {
  const meera = { id: 'm', name: 'Meera Nair', email: 'meera@x.y', color: '#111111', initials: 'MN' };
  const arjun = {
    id: 'a',
    name: 'Arjun Rao',
    email: 'arjun@x.y',
    color: '#222222',
    initials: 'AR',
    you: true,
  };
  const members = [
    { ...meera, tasks: [task('m1', SUN, 2), task('m2', '2026-10-19', 1), task('m0', null)] },
    { ...arjun, tasks: [task('a1', SUN, 1), task('a2', '2026-10-21', 1)] },
  ];

  it('C08-U01 finds people by name or email', () => {
    expect(findPeople([meera, arjun], 'mee').map((p) => p.id)).toEqual(['m']);
    expect(findPeople([meera, arjun], 'ARJUN@').map((p) => p.id)).toEqual(['a']);
    expect(findPeople([meera, arjun], '  ')).toHaveLength(2);
    expect(findPeople([meera, arjun], 'zed')).toEqual([]);
  });

  it('C08-U01 groups everyone’s tasks by day or by person, today or the week, Backlog tasks left out', () => {
    const byDay = groupShared(members, 'day', 'week', SUN);
    expect(byDay.map((g) => g.title)).toEqual(['Today · Sun 18 Oct', 'Tomorrow · Mon 19 Oct', 'Wed 21 Oct']);
    expect(byDay[0]!.items.map((i) => `${i.who.id}:${i.task.id}`)).toEqual(['m:m1', 'a:a1']);
    const today = groupShared(members, 'day', 'today', SUN);
    expect(today).toHaveLength(1);
    expect(today[0]!.items).toHaveLength(2);
    const byPerson = groupShared(members, 'person', 'week', SUN);
    expect(byPerson.map((g) => g.title)).toEqual(['Meera Nair', 'Arjun Rao (you)']);
    expect(byPerson[0]!.items.map((i) => i.task.id)).toEqual(['m1', 'm2']);
    expect(groupShared([{ ...meera, tasks: [task('x', null)] }], 'person', 'week', SUN)).toEqual([]);
  });

  it('C08-U01 lays one person’s week out day by day, empty days kept', () => {
    const days = personDays(members[0]!.tasks, '2026-10-12', SUN, SUN);
    expect(days).toHaveLength(7);
    expect(days[6]!.title).toBe('Today · Sunday');
    expect(days[6]!.tasks.map((t) => t.id)).toEqual(['m1']);
    expect(days[0]!.tasks).toEqual([]);
    expect(dayGroupTitle('2026-10-17', SUN)).toBe('Yesterday · Sat 17 Oct');
  });
});

describe('C08-U01 the Inbox’s words', () => {
  it('C08-U01 counts the header, Answered and Sent lines and narrows items by their words', async () => {
    const {
      inboxCountWords,
      answeredWords,
      sentWords,
      inboxBadge,
      acceptedWords,
      sentToWords,
      asksForWords,
      filterInbox,
      noMatchWords,
    } = await import('./inbox');
    expect(inboxCountWords({ toAnswer: 2, unread: 3 })).toBe('2 to answer · 3 new');
    expect(inboxCountWords({ toAnswer: 1, unread: 0 })).toBe('1 to answer');
    expect(inboxCountWords({ toAnswer: 0, unread: 0 })).toBe('All caught up');
    expect(answeredWords(4)).toBe('4 answered');
    expect(answeredWords(0)).toBe('Nothing answered yet');
    expect(sentWords([{ state: 'waiting' }, { state: 'accepted' }, { state: 'declined' }])).toBe(
      '3 sent · 1 waiting',
    );
    expect(sentWords([{ state: 'accepted' }])).toBe('1 sent');
    expect(sentWords([])).toBe('Nothing sent');
    expect(inboxBadge({ toAnswer: 2, unread: 3 })).toBe(5);
    expect(inboxBadge(undefined)).toBe(0);
    expect(acceptedWords('2026-10-16', SUN)).toBe('Accepted onto Fri 16 Oct. It’s in Answered.');
    expect(acceptedWords(null, SUN)).toBe('Accepted onto the Backlog. It’s in Answered.');
    expect(sentToWords('Meera')).toBe('Sent to Meera. It’s in Sent until Meera answers.');
    expect(sentToWords('Meera', 'Northwind')).toBe(
      'Sent to Meera in Northwind. It’s in Sent until Meera answers.',
    );
    expect(asksForWords('2026-10-20', SUN)).toBe('Asks for Tue 20 Oct');
    expect(asksForWords(null, SUN)).toBe('No day asked');
    expect(noMatchWords(' invoice ')).toBe(
      'Nothing in the Inbox matches “invoice”. Try a name or a task title.',
    );
    const who = { id: 'm', name: 'Meera Nair', email: 'meera@x.y', color: null, initials: 'MN' };
    const items = [
      {
        id: 'a',
        kind: 'request' as const,
        spaceId: 's',
        space: null,
        spaceName: 'Northwind',
        createdAt: '',
        readAt: null,
        request: {
          id: 'r',
          spaceId: 's',
          from: who,
          to: who,
          title: 'Pay the invoice',
          note: 'Before Friday',
          askedDay: null,
          due: null,
          projectId: null,
          attachments: [],
          state: 'waiting' as const,
          reason: null,
          seenAt: null,
          taskId: null,
          taskDay: null,
          createdAt: '',
          answeredAt: null,
        },
      },
      {
        id: 'b',
        kind: 'comment' as const,
        spaceId: 's',
        space: null,
        spaceName: 'Northwind',
        createdAt: '',
        readAt: null,
        comment: {
          id: 'c',
          html: '<p>Can I take the <b>second</b> half?</p>',
          author: who,
          task: { id: 't', ref: 'NW-1', title: 'Write the notes', day: null, done: false },
        },
      },
    ];
    expect(filterInbox(items, 'invoice').map((i) => i.id)).toEqual(['a']);
    expect(filterInbox(items, 'friday').map((i) => i.id)).toEqual(['a']);
    expect(filterInbox(items, 'MEERA').map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterInbox(items, 'second').map((i) => i.id)).toEqual(['b']);
    expect(filterInbox(items, '<b>')).toEqual([]);
    expect(filterInbox(items, '  ')).toHaveLength(2);
  });
});
