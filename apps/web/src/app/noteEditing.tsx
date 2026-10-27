import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@tudu/client';
import { ApiError } from '@tudu/client';
import { noteName, taskFromWords, type NoteTask, type SearchHit, type SearchResponse } from '@tudu/core';
import { Banner, showToast, type NoteEditorProps, type NoteTaskItem, type PickItem } from '@tudu/ui';
import { useState } from 'react';
import { API_URL } from './config';
import { openQuickAdd, type QuickAddSeed } from './dayView';
import {
  editorNote,
  movedWords,
  notebookStore,
  taskPick,
  todayIso,
  useNoteDrawings,
  useSaveState,
} from './notebook';
import { getRecentTasks } from './search';
import { api, meQuery, queryClient } from './session';
import { useOnline } from './tasks';

/** Where a task opens from a note: a page in this window, or the desk (the Mac's note window). */
export type OpenPath = (path: string) => void;

/** Tasks to link: what you typed found in every space, or the tasks you opened lately. */
function useTaskPicks(
  q: string,
  enabled: boolean,
): { items: PickItem[]; byKey: Map<string, NoteTask>; loading: boolean } {
  const me = queryClient.getQueryData<MeResponse>(meQuery.queryKey);
  const recentIds = getRecentTasks();
  const found = useQuery({
    queryKey: ['note-link-tasks', q, q ? '' : recentIds.join(',')],
    queryFn: async (): Promise<SearchHit[]> => {
      const r = q
        ? await api.get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&today=${todayIso()}`)
        : recentIds.length
          ? await api.get<SearchResponse>(`/api/search?ids=${encodeURIComponent(recentIds.join(','))}`)
          : { hits: [] };
      return r.hits;
    },
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const picks = (found.data ?? []).map((h) => taskPick(h, me?.spaces ?? []));
  return {
    items: picks,
    byKey: new Map(picks.map((p) => [p.key, p.task])),
    loading: enabled && found.isPending,
  };
}

/**
 * Everything the system's NoteEditor needs for one note, from the Notebook store: its words as they are, the save
 * state, the banner (offline, changed elsewhere), Move, Delete, links and Make a task. The page, the note window and
 * the phone's note page all write through this.
 */
export function useNoteEditor(
  id: string | null,
  o: {
    compact?: boolean;
    autoFocus?: boolean;
    /** The note went to Trash: open the next one, or close. */
    onDeleted?: () => void;
    /** Undo of a delete: show it again. */
    onBack?: (id: string) => void;
    openPath: OpenPath;
    /** Make a task: New task opens on these words (Quick Add over the page unless the window says otherwise). */
    makeTask?: (seed: QuickAddSeed) => void;
  },
): NoteEditorProps {
  const q = useQuery({ ...notebookStore.noteQuery(id ?? ''), enabled: !!id, retry: false });
  const tree = useQuery(notebookStore.treeQuery()).data;
  const { state, slow } = useSaveState(id);
  const online = useOnline();
  const [taskQ, setTaskQ] = useState('');
  const picks = useTaskPicks(taskQ, !!id);
  const view = q.data;
  const drawings = useNoteDrawings(id, view);
  if (!id) return { loading: true };
  if (q.isPending) return { loading: true, compact: o.compact };
  if (q.isError || !view)
    return {
      error: true,
      compact: o.compact,
      onRetry: () => void q.refetch(),
    };

  const banner =
    state === 'conflict' ? (
      <Banner
        tone="warning"
        title="This note changed in another window."
        actions={[
          { label: 'Show the newer one', primary: true, onClick: () => void notebookStore.showNewer(id) },
          { label: 'Keep mine', onClick: () => void notebookStore.keepMine(id) },
        ]}
      >
        Your last edits are kept here until you choose.
      </Banner>
    ) : !online ? (
      <Banner tone="warning" title="You’re offline.">
        This note is kept on this device and saves when you’re back.
      </Banner>
    ) : null;

  const openTask = (t: NoteTaskItem) => o.openPath(t.id ? `/t/${encodeURIComponent(t.id)}` : '/');
  return {
    note: editorNote(view),
    compact: o.compact,
    autoFocus: o.autoFocus,
    save: state,
    slow,
    banner,
    folders: tree?.folders ?? [],
    tasks: picks.items,
    tasksLoading: picks.loading,
    onTaskQuery: setTaskQ,
    onTitle: (title) => notebookStore.edit(id, { title }),
    onBody: (html) => notebookStore.edit(id, { html }),
    onLeave: () => notebookStore.flush(id),
    onMove: (folderId, name) => {
      const was = view.folderId;
      notebookStore.moveNote(id, folderId);
      showToast(movedWords(name), { action: 'Undo', onAction: () => notebookStore.moveNote(id, was) });
    },
    onDelete: () => {
      notebookStore.deleteNote(id);
      o.onDeleted?.();
      showToast('Moved to Trash. It stays there for 30 days.', {
        action: 'Undo',
        onAction: () => {
          notebookStore.restoreNote(id);
          o.onBack?.(id);
        },
      });
    },
    onLink: (x) => {
      const task = picks.byKey.get(x.key);
      if (task) notebookStore.link(id, task);
    },
    onUnlink: (t) => {
      const task = view.linked.find((x) => x.id === t.key);
      notebookStore.unlink(id, t.key);
      showToast(`Unlinked from ${t.id}. The task is unchanged.`, {
        action: 'Undo',
        onAction: () => task && notebookStore.link(id, task),
      });
    },
    onOpenTask: openTask,
    // Make a task opens New task on the words, in Personal on Today; nothing is made until Add task. The note rides
    // along as the pill on its top line, so the task links back to it.
    onMakeTask: (words) => {
      const me = queryClient.getQueryData<MeResponse>(meQuery.queryKey);
      const personal = me?.spaces.find((s) => s.kind === 'personal');
      const w = taskFromWords(words);
      if (!w.title) return;
      const seed: QuickAddSeed = {
        title: w.title,
        note: w.note,
        spaceId: personal?.id,
        from: { noteId: id, name: view.title.trim() || view.first.trim() ? noteName(view) : 'This note' },
      };
      (o.makeTask ?? openQuickAdd)(seed);
    },
    onAttach: async (file, onProgress) => {
      try {
        const f = await notebookStore.upload(file, onProgress);
        return { id: f.id, name: f.name, size: f.size };
      } catch (err) {
        throw err instanceof ApiError
          ? err
          : new Error('Couldn’t attach the file. Check your connection and retry.');
      }
    },
    fileBase: API_URL,
    offline: !online,
    drawings,
  };
}
