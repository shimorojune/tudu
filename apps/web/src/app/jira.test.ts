import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { JiraLink, SpaceSummary, SyncMutation, Task } from '@tudu/core';
import { applyToLinks, jiraConnectionKey, jiraLinksKey, jiraSpacesKey } from '@tudu/client';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { moreItems } from '../routes/more/MorePage';
import { phoneTab } from './AppShell';
import { askOf, panelState, toPanelIssue } from './JiraHost';
import {
  jiraParam,
  openInJira,
  reloadJiraPickForTests,
  resetJiraForTests,
  setJiraPick,
  useJira,
  useJiraPick,
  withJira,
} from './jira';
import { queryClient } from './session';
import { sectionFor } from './settings';
import { viewOf } from './space';

const at = '2026-10-18T10:00:00.000Z';
const base = {
  connected: true,
  reconnecting: false,
  expired: false,
  online: true,
  hasData: true,
  pending: false,
  errorCode: null,
};

describe('C10-U09 Jira in the web app', () => {
  it('the panel in the address; the phone page and its tab; the state from the reads; views; More and Settings', () => {
    // ?jira opens the panel beside the page; ?jira=KEY opens an issue; closing drops it and keeps the rest.
    expect(jiraParam('')).toEqual({ open: false, issue: null });
    expect(jiraParam('?jira')).toEqual({ open: true, issue: null });
    expect(jiraParam('?jira=')).toEqual({ open: true, issue: null });
    expect(jiraParam('?task=ME-1&jira=tudu-212')).toEqual({ open: true, issue: 'TUDU-212' });
    const loc = { pathname: '/northwind', searchStr: '?task=ME-1' };
    expect(withJira(loc, null)).toBe('/northwind?task=ME-1&jira');
    expect(withJira(loc, 'TUDU-212')).toBe('/northwind?task=ME-1&jira=TUDU-212');
    expect(withJira({ pathname: '/me', searchStr: '?jira=TUDU-1' }, false)).toBe('/me');

    // Phones: Jira is a page and a tab once connected; before, the form lives under More › Apps.
    expect(viewOf('/northwind/jira')).toBe('jira');
    expect(viewOf('/northwind/apps')).toBe('apps');
    expect(phoneTab({ view: 'jira', onToday: false, searchOpen: false, jira: true })).toBe('jira');
    expect(phoneTab({ view: 'jira', onToday: false, searchOpen: false, jira: false })).toBe('more');
    expect(phoneTab({ view: 'apps', onToday: false, searchOpen: false })).toBe('more');
    const nw = { kind: 'team' as const, name: 'Northwind' };
    expect(moreItems(nw).map((i) => i.value)).toEqual(['backlog', 'people', 'apps', 'settings']);
    expect(moreItems(nw, true).find((i) => i.value === 'apps')!.hint).toBe('Jira');
    expect(sectionFor('apps', nw)).toBe('apps');

    // What the panel shows, from what the reads say.
    expect(panelState({ ...base, connected: false })).toBe('connect');
    expect(panelState({ ...base, reconnecting: true })).toBe('reconnect');
    expect(panelState({ ...base, expired: true })).toBe('expired');
    expect(panelState({ ...base, errorCode: 'expired' })).toBe('expired');
    expect(panelState({ ...base, online: false })).toBe('offline');
    expect(panelState({ ...base, errorCode: 'unreachable' })).toBe('error');
    expect(panelState({ ...base, hasData: false, pending: true })).toBe('loading');
    expect(panelState(base)).toBe('ready');

    // The view picked, per space: a saved view that is gone falls back to Assigned to me.
    expect(askOf({ view: 'assigned' }, [])).toEqual({ view: 'assigned' });
    expect(askOf({ view: 'v1' }, [{ id: 'v1' }])).toEqual({ view: 'v1' });
    expect(askOf({ view: 'v9' }, [{ id: 'v1' }])).toEqual({ view: 'assigned' });
    expect(askOf({ view: 'custom', jql: 'project = OPS' }, [])).toEqual({ jql: 'project = OPS' });
    setJiraPick({ view: 'v1' });
    expect(JSON.parse(localStorage.getItem('tudu.jira.view')!)).toEqual({ view: 'v1' });

    // A row carries its linked tasks, open ones first.
    const link = (taskId: string, done: boolean, spaceId = 's1'): JiraLink => ({
      key: 'A-1',
      taskId,
      spaceId,
      ref: 'ME-1',
      title: 't',
      day: null,
      done,
    });
    const row = toPanelIssue(
      { key: 'A-1', summary: 'One', status: '', due: null, updated: null },
      new Map([['A-1', [link('t2', false), link('t1', true)]]]),
    );
    expect(row).toMatchObject({
      key: 'A-1',
      status: undefined,
      linked: [{ taskId: 't2' }, { taskId: 't1' }],
    });
    // A task in another of your spaces names that space; one here names none.
    const north = { id: 'nw', name: 'Northwind', color: '#3d5a80', kind: 'team' } as SpaceSummary;
    const across = toPanelIssue(
      { key: 'A-1', summary: 'One', status: '', due: null, updated: null },
      new Map([['A-1', [link('t2', false, 'nw'), link('t1', false, 's1')]]]),
      's1',
      (id) => (id === 'nw' ? north : undefined),
    );
    expect(across.linked![0]!.space).toEqual({ name: 'Northwind', color: '#3d5a80', personal: false });
    expect(across.linked![1]!.space).toBeUndefined();
  });
});

describe('C10-U11 the links read follows your changes', () => {
  it('a linked create, a link and unlink, a move, a cross-off, a delete and an Undo', () => {
    const t = (over: Partial<Task> = {}): Task => ({
      id: 't1',
      spaceId: 's',
      number: 1,
      ref: 'ME-1',
      title: 'One',
      day: '2026-10-18',
      position: 1,
      done: false,
      doneAt: null,
      carriedFrom: null,
      due: null,
      visibility: 'space',
      projectId: null,
      jira: null,
      links: [],
      ownerId: 'u',
      subtasks: [],
      subsDone: 0,
      subsTotal: 0,
      commentCount: 0,
      createdAt: at,
      updatedAt: at,
      ...over,
    });
    const known = new Map<string, Task>([['t1', t()]]);
    const look = (id: string) => known.get(id);
    const m = (body: Record<string, unknown>) => ({ id: 'x', at, ...body }) as unknown as SyncMutation;

    let links = applyToLinks(
      [],
      m({
        type: 'task.create',
        payload: { id: 't2', spaceId: 's', title: 'Two', day: null, position: null, jira: 'A-2' },
      }),
      look,
    );
    expect(links).toEqual([
      { key: 'A-2', taskId: 't2', spaceId: 's', ref: null, title: 'Two', day: null, done: false },
    ]);
    // The read is every space's: another space's create joins it, linked the new way.
    expect(
      applyToLinks(
        links,
        m({
          type: 'task.create',
          payload: {
            id: 't3',
            spaceId: 'o',
            title: 'x',
            day: null,
            position: null,
            link: { provider: 'jira', key: 'A-3' },
          },
        }),
        look,
      ).map((l) => [l.key, l.spaceId]),
    ).toEqual([
      ['A-2', 's'],
      ['A-3', 'o'],
    ]);

    links = applyToLinks(
      links,
      m({ type: 'task.link', payload: { id: 't1', provider: 'jira', key: 'A-1' } }),
      look,
    );
    expect(links.find((l) => l.taskId === 't1')).toMatchObject({
      key: 'A-1',
      ref: 'ME-1',
      day: '2026-10-18',
    });
    links = applyToLinks(
      links,
      m({ type: 'task.place', payload: { id: 't1', day: null, position: null } }),
      look,
    );
    links = applyToLinks(links, m({ type: 'task.cross', payload: { id: 't1', done: true } }), look);
    expect(links.find((l) => l.taskId === 't1')).toMatchObject({ day: null, done: true });
    links = applyToLinks(
      links,
      m({ type: 'task.link', payload: { id: 't1', provider: 'jira', key: null } }),
      look,
    );
    expect(links.map((l) => l.taskId)).toEqual(['t2']);
    links = applyToLinks(links, m({ type: 'task.delete', payload: { id: 't2' } }), look);
    expect(links).toEqual([]);
    known.set(
      't2',
      t({ id: 't2', jira: 'A-2', links: [{ provider: 'jira', key: 'A-2' }], title: 'Two', day: null }),
    );
    links = applyToLinks(links, m({ type: 'task.restore', payload: { id: 't2' } }), look);
    expect(links).toMatchObject([{ key: 'A-2', taskId: 't2' }]);
    // A queued change from a build before connectors still applies.
    links = applyToLinks(links, m({ type: 'task.jira', payload: { id: 't2', jira: null } }), look);
    expect(links).toEqual([]);
  });
});

describe('C10-U16 Jira is your account’s, on per space', () => {
  const CONN = {
    connected: true as const,
    site: 'https://jira.northwind.io',
    who: { name: 'Ada', email: 'ada@x.io' },
    state: 'ok' as const,
    syncedAt: null,
    views: [],
    assigned: ['A-1', 'A-2'],
    count: 2,
    onIn: 1,
  };
  const wrap = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  afterEach(() => {
    queryClient.clear();
    resetJiraForTests();
  });

  it('conn is set only where Jira is on; connected says it is yours either way', async () => {
    queryClient.setQueryData(jiraConnectionKey(), CONN);
    queryClient.setQueryData(jiraSpacesKey(), {
      spaces: [
        { id: 'me', name: 'Personal', kind: 'personal', color: null, on: true, linked: 0 },
        { id: 'nw', name: 'Northwind', kind: 'team', color: null, on: false, linked: 0 },
      ],
    });
    queryClient.setQueryData(jiraLinksKey(), { links: [] });
    const here = renderHook(() => useJira('me'), { wrapper: wrap });
    await waitFor(() => expect(here.result.current.conn).not.toBeNull());
    expect(here.result.current).toMatchObject({ onHere: true, count: 2 });
    const off = renderHook(() => useJira('nw'), { wrapper: wrap });
    expect(off.result.current.conn).toBeNull();
    expect(off.result.current.connected).toMatchObject({ site: 'https://jira.northwind.io' });
    expect(off.result.current.onHere).toBe(false);
    expect(off.result.current.count).toBeNull();
    // Opening an issue from a task in a space where it is off does nothing.
    expect(openInJira('nw', 'A-1')).toBe(false);
  });

  it('the old per-space view pick becomes the one pick, once', () => {
    localStorage.setItem(
      'tudu.jira.view',
      JSON.stringify({ s1: { view: 'v1' }, s2: { view: 'custom', jql: 'x' } }),
    );
    reloadJiraPickForTests();
    const { result } = renderHook(() => useJiraPick());
    expect(result.current).toEqual({ view: 'v1' });
    expect(JSON.parse(localStorage.getItem('tudu.jira.view')!)).toEqual({ view: 'v1' });
    reloadJiraPickForTests();
    expect(renderHook(() => useJiraPick()).result.current).toEqual({ view: 'v1' });
    localStorage.setItem('tudu.jira.view', 'not json');
    reloadJiraPickForTests();
    expect(renderHook(() => useJiraPick()).result.current).toEqual({ view: 'assigned' });
  });
});
