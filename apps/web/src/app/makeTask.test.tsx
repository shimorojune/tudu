import { QueryClientProvider } from '@tanstack/react-query';
import type { MeResponse, NoteView } from '@tudu/client';
import type { SpaceSummary } from '@tudu/core';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickAddSeed } from './dayView';
import { notebookStore } from './notebook';
import { linkToNote, useQuickAddActions } from './quickAdd';
import { useNoteEditor } from './noteEditing';
import { api, meQuery, queryClient } from './session';
import { taskStore } from './tasks';

vi.mock('./workingDay', () => ({ useWorkingDay: () => ({ today: '2026-10-18' }) }));
vi.mock('./dayView', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  usePage: () => 'today',
  useShownWeek: () => null,
  useShownDay: () => null,
  useDayView: () => 'list',
  openQuickAdd: vi.fn(),
}));

const space = (id: string, kind: 'personal' | 'team', name: string): SpaceSummary => ({
  id,
  kind,
  name,
  color: kind === 'team' ? '#3d5a80' : null,
  role: 'admin',
  slug: name.toLowerCase(),
  prefix: 'XX',
  members: 1,
  inbox: { toAnswer: 0, unread: 0 },
});
const ME = {
  user: { id: 'u', name: 'Rohit', email: 'r@example.com', color: null, image: null },
  spaces: [space('p', 'personal', 'Personal'), space('n', 'team', 'Northwind')],
} as unknown as MeResponse;

const note = (over: Partial<NoteView> = {}): NoteView =>
  ({
    id: 'n1',
    title: 'Offsite agenda draft',
    first: 'Venue, food, the plan',
    html: '<p>Venue, food, the plan</p>',
    folderId: null,
    updatedAt: '2026-10-18T09:00:00Z',
    createdAt: '2026-10-18T09:00:00Z',
    rev: 1,
    path: [],
    words: 4,
    linked: [],
    gen: 0,
    ...over,
  }) as unknown as NoteView;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

function editor(view: NoteView, makeTask?: (seed: QuickAddSeed) => void) {
  vi.spyOn(notebookStore, 'noteQuery').mockReturnValue({
    queryKey: ['test-note', view.id],
    queryFn: async () => view,
  } as never);
  vi.spyOn(notebookStore, 'treeQuery').mockReturnValue({
    queryKey: ['test-tree'],
    queryFn: async () => ({ folders: [], notes: [] }),
  } as never);
  return renderHook(() => useNoteEditor(view.id, { openPath: () => {}, makeTask }), { wrapper });
}

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(meQuery.queryKey, ME);
  vi.spyOn(api, 'get').mockResolvedValue({ hits: [] } as never);
});
afterEach(() => vi.restoreAllMocks());

describe('C22-U25 Make a task hands New task its words', () => {
  it('C22-U25 the host gets the title, the note and the note it came from; nothing is made', async () => {
    const makeTask = vi.fn();
    const create = vi.spyOn(taskStore, 'create');
    const link = vi.spyOn(notebookStore, 'link').mockImplementation(() => {});
    const { result } = editor(note(), makeTask);
    await waitFor(() => expect(result.current.onMakeTask).toBeTypeOf('function'));
    result.current.onMakeTask!('Call the venue\n\nAsk Meera for the headcount');
    expect(makeTask).toHaveBeenCalledWith({
      title: 'Call the venue',
      note: '<p>Ask Meera for the headcount</p>',
      spaceId: 'p',
      from: { noteId: 'n1', name: 'Offsite agenda draft' },
    });
    expect(create).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });

  it('C22-U25 a note with no title is named by its first line, a blank one “This note”; blank words open nothing', async () => {
    const makeTask = vi.fn();
    const first = editor(note({ title: '' }), makeTask);
    await waitFor(() => expect(first.result.current.onMakeTask).toBeTypeOf('function'));
    first.result.current.onMakeTask!('Gutters');
    expect(makeTask.mock.calls[0]![0].from).toEqual({ noteId: 'n1', name: 'Venue, food, the plan' });
    first.unmount();

    const blank = editor(note({ id: 'n2', title: '', first: '' } as Partial<NoteView>), makeTask);
    await waitFor(() => expect(blank.result.current.onMakeTask).toBeTypeOf('function'));
    blank.result.current.onMakeTask!('Gutters');
    expect(makeTask.mock.calls[1]![0].from).toEqual({ noteId: 'n2', name: 'This note' });
    blank.result.current.onMakeTask!('  \n ');
    expect(makeTask).toHaveBeenCalledTimes(2);
  });
});

describe('C22-U26 the task made from a note links back to it', () => {
  it('C22-U26 with from, the new task links to that note after it is made, with its space', () => {
    const order: string[] = [];
    vi.spyOn(taskStore, 'create').mockImplementation(() => (order.push('create'), 't9'));
    const link = vi.spyOn(notebookStore, 'link').mockImplementation(() => void order.push('link'));
    const { result } = renderHook(() => useQuickAddActions('n'), { wrapper });
    const id = result.current.save({
      title: 'Call the venue',
      planned: '2026-10-18',
      from: { noteId: 'n1', name: 'Offsite agenda draft' },
    } as never);
    expect(id).toBe('t9');
    expect(order).toEqual(['create', 'link']);
    expect(link).toHaveBeenCalledWith('n1', {
      id: 't9',
      ref: '',
      title: 'Call the venue',
      spaceId: 'n',
      space: { name: 'Northwind', color: '#3d5a80', personal: false },
    });
  });

  it('C22-U26 without from it doesn’t link; a save that fails makes no link', () => {
    const link = vi.spyOn(notebookStore, 'link').mockImplementation(() => {});
    vi.spyOn(taskStore, 'create').mockReturnValue('t1');
    const { result } = renderHook(() => useQuickAddActions('p'), { wrapper });
    result.current.save({ title: 'Gutters', planned: '2026-10-18', from: null } as never);
    expect(link).not.toHaveBeenCalled();

    vi.spyOn(taskStore, 'create').mockImplementation(() => {
      throw new Error('offline');
    });
    expect(() =>
      result.current.save({ title: 'Gutters', planned: null, from: { noteId: 'n1', name: 'x' } } as never),
    ).toThrow();
    expect(link).not.toHaveBeenCalled();
  });

  it('C22-U26 linkToNote marks a Personal task as personal', () => {
    const link = vi.spyOn(notebookStore, 'link').mockImplementation(() => {});
    linkToNote('n1', 't2', 'p', 'Gutters');
    expect(link.mock.calls[0]![1].space).toEqual({ name: 'Personal', color: null, personal: true });
  });
});
