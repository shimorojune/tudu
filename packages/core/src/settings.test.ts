import { describe, expect, it } from 'vitest';
import {
  canChangeRole,
  deleteAsk,
  deleteWords,
  leaveAsk,
  removeAsk,
  goneWords,
  personNameSchema,
  spaceForSlug,
  spaceLine,
  spaceRules,
  spaceSlug,
  syncMutationSchema,
} from './index';

const A = { id: 'a', role: 'admin' as const };
const B = { id: 'b', role: 'member' as const };
const C = { id: 'c', role: 'admin' as const };

describe('C09-U01 settings rules', () => {
  it('a rename finds a free slug past the old ones and the taken ones', () => {
    expect(spaceSlug('Northwind Labs', ['northwind'])).toBe('northwind-labs');
    expect(spaceSlug('Northwind', ['northwind', 'northwind-2'])).toBe('northwind-3');
    expect(spaceSlug('Settings')).toBe('settings-2');
  });

  it('an old slug still finds its space, and says it moved', () => {
    const spaces = [
      { id: 'p', kind: 'personal' as const, slug: 'me' },
      { id: 'n', kind: 'team' as const, slug: 'northwind-labs', oldSlugs: ['northwind'] },
    ];
    expect(spaceForSlug(spaces, 'northwind-labs')).toEqual({ space: spaces[1], moved: false });
    expect(spaceForSlug(spaces, 'northwind')).toEqual({ space: spaces[1], moved: true });
    expect(spaceForSlug(spaces, 'me')?.space.id).toBe('p');
    expect(spaceForSlug(spaces, 'nowhere')).toBeNull();
  });

  it('who may leave', () => {
    expect(spaceRules({ kind: 'personal', role: 'admin' }, [A], 'a').leaveBlock).toBe('personal');
    expect(spaceRules({ kind: 'team', role: 'admin' }, [A], 'a').leaveBlock).toBe('last-person');
    expect(spaceRules({ kind: 'team', role: 'admin' }, [A, B], 'a').leaveBlock).toBe('last-admin');
    expect(spaceRules({ kind: 'team', role: 'admin' }, [A, B, C], 'a').leaveBlock).toBeNull();
    expect(spaceRules({ kind: 'team', role: 'member' }, [A, B], 'b').leaveBlock).toBeNull();
  });

  it('admins run the space; Personal has no admin powers', () => {
    expect(spaceRules({ kind: 'team', role: 'admin' }, [A, B], 'a').admin).toBe(true);
    expect(spaceRules({ kind: 'team', role: 'member' }, [A, B], 'b').admin).toBe(false);
    expect(spaceRules({ kind: 'personal', role: 'admin' }, [A], 'a').admin).toBe(false);
  });

  it('roles: never your own, never the last admin down to member', () => {
    expect(canChangeRole([A, B], 'a', 'b', 'admin')).toBe(true);
    expect(canChangeRole([A, B], 'a', 'a', 'member')).toBe(false);
    expect(canChangeRole([A, B], 'a', 'b', 'member')).toBe(false);
    expect(canChangeRole([A, C], 'a', 'c', 'member')).toBe(true);
    expect(canChangeRole([A], 'b', 'a', 'member')).toBe(false);
  });

  it('the lines', () => {
    expect(spaceLine(1, 'admin')).toBe('Just you · You’re an admin');
    expect(spaceLine(19, 'member')).toBe('19 people · You’re a member');
    expect(deleteWords(1)).toBe('Removes it and everything in it. This can’t be undone.');
    expect(deleteWords(19)).toBe(
      'Removes it, and everything in it, for all 19 people. This can’t be undone.',
    );
    expect(goneWords({ name: 'Northwind', how: 'deleted', by: 'Rohit' })).toBe(
      'Northwind was deleted by Rohit.',
    );
    expect(goneWords({ name: 'Northwind', how: 'removed', by: 'Rohit' })).toBe(
      'You were removed from Northwind by Rohit.',
    );
    expect(goneWords({ name: 'Northwind', how: 'left', by: null })).toBe('You left Northwind.');
  });

  it('the asks', () => {
    expect(leaveAsk('Northwind', null)).toMatchObject({
      title: 'Leave Northwind?',
      confirm: 'Leave Northwind',
    });
    expect(leaveAsk('Northwind', 'last-admin').confirm).toBe('Go to Members');
    expect(leaveAsk('Northwind', 'last-person').body).toMatch(/Delete it instead/);
    expect(removeAsk('Meera', 'Northwind').title).toBe('Remove Meera?');
    expect(deleteAsk('Northwind', 19).body).toMatch(/for all 19 people/);
    expect(deleteAsk('Northwind', 1).body).toMatch(/for good/);
  });

  it('a name needs words; the new mutations parse', () => {
    expect(personNameSchema.safeParse('  ').success).toBe(false);
    expect(personNameSchema.parse('  Meera Iyer ')).toBe('Meera Iyer');
    const at = '2026-10-21T10:00:00.000Z';
    for (const m of [
      { id: '1', at, type: 'me.rename', payload: { id: 'u', name: 'Meera' } },
      { id: '2', at, type: 'space.update', payload: { id: 's', name: 'Northwind Labs' } },
      { id: '3', at, type: 'space.update', payload: { id: 's', color: '#3d5a80' } },
      { id: '4', at, type: 'project.restore', payload: { id: 'p', spaceId: 's' } },
    ])
      expect(syncMutationSchema.safeParse(m).success).toBe(true);
    expect(
      syncMutationSchema.safeParse({ id: '5', at, type: 'space.update', payload: { id: 's', color: 'red' } })
        .success,
    ).toBe(false);
  });
});
