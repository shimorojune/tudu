import { describe, expect, it } from 'vitest';
import {
  clearedWords,
  filterInbox,
  inboxBadge,
  inboxCountWords,
  inviteWords,
  noticeWords,
  nothingFromWords,
  sumCounts,
  type InboxItem,
} from './inbox';

const who = { id: 's', name: 'Sana Qureshi', email: 'sana@x.y', color: null, initials: 'SQ' };

describe('one Inbox, counted and searched across spaces', () => {
  it('C08-U12 counts add up across spaces; the badge and the words read the total', () => {
    const bySpace = { nw: { toAnswer: 1, unread: 2 }, pf: { toAnswer: 0, unread: 1 }, me: undefined };
    const total = sumCounts(Object.values(bySpace));
    expect(total).toEqual({ toAnswer: 1, unread: 3 });
    expect(inboxBadge(total)).toBe(4);
    expect(inboxCountWords(total)).toBe('1 to answer · 3 new');
    expect(sumCounts([])).toEqual({ toAnswer: 0, unread: 0 });
    expect(clearedWords(3)).toBe('3 updates deleted');
    expect(clearedWords(1)).toBe('1 update deleted');
    expect(nothingFromWords('Northwind')).toBe('Nothing from Northwind');
  });

  it('C08-U13 invites match by inviter and space, notices by space; the words read like sentences', () => {
    const invite: InboxItem = {
      id: 'v',
      kind: 'invite',
      spaceId: 'dg',
      space: null,
      spaceName: 'Design Guild',
      createdAt: '2026-10-24T09:00:00Z',
      readAt: null,
      invite: {
        id: 'i',
        from: who,
        space: { id: 'dg', name: 'Design Guild', color: null, initials: 'DG' },
        state: 'open',
      },
    };
    const notice: InboxItem = {
      id: 'n',
      kind: 'notice',
      spaceId: null,
      space: null,
      spaceName: 'Pilot Farm',
      createdAt: '2026-10-23T09:00:00Z',
      readAt: null,
      notice: { type: 'removed', by: 'Arjun' },
    };
    const items = [invite, notice];
    expect(filterInbox(items, 'sana').map((i) => i.id)).toEqual(['v']);
    expect(filterInbox(items, 'guild').map((i) => i.id)).toEqual(['v']);
    expect(filterInbox(items, 'pilot').map((i) => i.id)).toEqual(['n']);
    expect(filterInbox(items, 'arjun').map((i) => i.id)).toEqual(['n']);
    // filtering keeps the order it was given: newest first across spaces
    expect(filterInbox(items, '').map((i) => i.id)).toEqual(['v', 'n']);
    expect(inviteWords(invite.invite!)).toBe('Sana Qureshi invited you to Design Guild');
    expect(inviteWords({ ...invite.invite!, from: null })).toBe('You’re invited to Design Guild');
    expect(noticeWords(notice.notice!, 'Pilot Farm')).toBe('Arjun removed you from Pilot Farm');
    expect(noticeWords({ type: 'removed', by: null }, 'Pilot Farm')).toBe('You were removed from Pilot Farm');
    expect(noticeWords({ type: 'deleted', by: 'Arjun' }, 'Pilot Farm')).toBe('Arjun deleted Pilot Farm');
    expect(noticeWords({ type: 'deleted', by: null }, 'Pilot Farm')).toBe('Pilot Farm was deleted');
  });
});
