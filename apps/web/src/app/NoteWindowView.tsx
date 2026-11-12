import { useQuery } from '@tanstack/react-query';
import { noteName } from '@tudu/core';
import { NoteEditor, NoteWindow, type NoteWindowProps } from '@tudu/ui';
import {
  deleteFolderFromTree,
  noteItem,
  notebookStore,
  showInWindow,
  treeItems,
  useNoteWindow,
} from './notebook';
import type { QuickAddSeed } from './dayView';
import { useNoteEditor, type OpenPath } from './noteEditing';

export interface NoteWindowViewProps extends Pick<
  NoteWindowProps,
  | 'variant'
  | 'rail'
  | 'pinned'
  | 'expanded'
  | 'onPin'
  | 'onExpand'
  | 'openLabel'
  | 'onDragStart'
  | 'onResizeStart'
> {
  onClose: () => void;
  /** Open in your Notebook (the Tudu mark). Gets the open note, unless it's still blank. */
  onOpenApp?: (noteId: string | null) => void;
  /** Where a linked task, or a task just made, opens. */
  openPath: OpenPath;
  /** Make a task: where New task opens (the Mac's floating bar); Quick Add over the page by default. */
  makeTask?: (seed: QuickAddSeed) => void;
}

/**
 * The note window's inside, the same in the browser's floating panel and the Mac's own window: your
 * notes down the left (Recent, or All notes, where folders are made and changed too), the note on the right. It opens on a blank note unless it was asked
 * for one; a blank note closed without a word is never kept.
 */
export function NoteWindowView(p: NoteWindowViewProps) {
  const { note } = useNoteWindow();
  const current = note?.id ?? null;
  const recent = useQuery(notebookStore.recentQuery());
  const tree = useQuery(notebookStore.treeQuery());
  const view = useQuery({ ...notebookStore.noteQuery(current ?? ''), enabled: !!current }).data;
  const items = treeItems(tree.data);
  const blank = !!note?.blank;
  const editor = useNoteEditor(current, {
    compact: true,
    autoFocus: blank,
    onDeleted: () => showInWindow(null),
    onBack: (id) => showInWindow(id),
    openPath: p.openPath,
    makeTask: p.makeTask,
  });
  const title = view && (view.title.trim() || view.first.trim()) ? noteName(view) : '';

  return (
    <NoteWindow
      variant={p.variant}
      rail={p.rail}
      active={current ?? 'new'}
      blank={blank}
      title={title}
      recent={(recent.data ?? []).map((n) => noteItem(n))}
      recentLoading={recent.isPending}
      tree={{ folders: items.folders, notes: items.notes }}
      treeLoading={tree.isPending}
      treeError={tree.isError}
      onTreeRetry={() => void tree.refetch()}
      // All notes is the Notebook page's tree: the same calls, so a folder made here is the same folder there.
      onNewNote={(folder) => showInWindow(null, undefined, folder?.id ?? null)}
      onCreateFolder={(parentId, name) => {
        const r = notebookStore.createFolder(parentId, name);
        return 'error' in r ? r.error : null;
      }}
      onRenameFolder={(f, name) => notebookStore.renameFolder(f.id, name)?.error ?? null}
      onDeleteFolder={(f) => {
        // The open note went to Trash with its folder: the window goes back to a blank one.
        if (deleteFolderFromTree(f, current)) showInWindow(null);
      }}
      onMoveNote={(id, folderId, index) => notebookStore.moveNote(id, folderId, index)}
      onMoveFolder={(id, parentId, index) => notebookStore.moveFolder(id, parentId, index)}
      pinned={p.pinned}
      expanded={p.expanded}
      openLabel={p.openLabel}
      onPin={p.onPin}
      onExpand={p.onExpand}
      onDragStart={p.onDragStart}
      onResizeStart={p.onResizeStart}
      onPick={(id) => showInWindow(id)}
      onNew={() => showInWindow(null)}
      onOpenApp={
        p.onOpenApp
          ? () => {
              const id = current && !notebookStore.isDraft(current) ? current : null;
              if (current) notebookStore.flush(current);
              p.onOpenApp!(id);
            }
          : undefined
      }
      onClose={p.onClose}
    >
      {current ? <NoteEditor {...editor} /> : <NoteEditor loading compact />}
    </NoteWindow>
  );
}
