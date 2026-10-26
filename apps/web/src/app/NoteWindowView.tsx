import { useQuery } from '@tanstack/react-query';
import { noteName } from '@tudu/core';
import { NoteEditor, NoteWindow, type NoteWindowProps } from '@tudu/ui';
import { noteItem, notebookStore, showInWindow, treeItems, useNoteWindow } from './notebook';
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
  /** Open in your Notebook (Mac), ↗ (web), Open in Tudu (the popup). Gets the open note, unless it's still blank. */
  onOpenApp?: (noteId: string | null) => void;
  /** Where a linked task, or a task just made, opens. */
  openPath: OpenPath;
  /** Make a task: where New task opens (the Mac's floating bar); Quick Add over the page by default. */
  makeTask?: (seed: QuickAddSeed) => void;
}

/**
 * The note window's inside, the same in the browser's floating panel, its popup and the Mac's own window: your
 * notes down the left (Recent, or All notes), the note on the right. It opens on a blank note unless it was asked
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
