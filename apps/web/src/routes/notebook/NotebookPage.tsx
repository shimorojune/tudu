import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { notesBelow } from '@tudu/core';
import {
  EmptyState,
  Icon,
  NoteEditor,
  NoteTrash,
  NoteTree,
  showToast,
  type NoteFolderItem,
  type NoteTrashItem,
} from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import { notebookStore, notesInOrder, trashItem, treeItems } from '../../app/notebook';
import { useNoteEditor } from '../../app/noteEditing';
import { NOTEBOOK_PATH } from '../../app/space';
import { useViewport } from '../../app/viewport';
import './notebook.css';

const TRASH = `${NOTEBOOK_PATH}/trash`;
export const notePath = (id: string) => `${NOTEBOOK_PATH}/${encodeURIComponent(id)}`;

/** Which note (or Trash) an address shows. */
export function notebookAt(pathname: string): { noteId: string | null; trash: boolean } {
  if (pathname === TRASH) return { noteId: null, trash: true };
  const m = /^\/notebook\/([^/]+)$/.exec(pathname);
  return { noteId: m ? decodeURIComponent(m[1]!) : null, trash: false };
}

/**
 * The Notebook page: the tree of folders and notes on the left (Find at the top, Trash at the bottom), the open note
 * on the right. On a phone the list is its own page and a note turns in over it; ‹ Notebook turns back.
 */
export function NotebookPage() {
  const vp = useViewport();
  const phone = vp === 'phone';
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { noteId, trash } = notebookAt(pathname);
  const treeQ = useQuery(notebookStore.treeQuery());
  const trashQ = useQuery({ ...notebookStore.trashQuery(), enabled: trash });
  const items = treeItems(treeQ.data);
  const order = notesInOrder(treeQ.data);
  const go = (href: string, replace = false) => void navigate({ href, replace });
  // A note opened on a phone turns in; going back turns the other way.
  const [dir, setDir] = useState<'in' | 'back'>('in');

  // The note you leave saves what's waiting; a blank one made here goes away again.
  const open = useRef<string | null>(null);
  useEffect(() => {
    const was = open.current;
    open.current = noteId;
    if (was && was !== noteId) notebookStore.close(was);
  }, [noteId]);
  useEffect(
    () => () => {
      if (open.current) notebookStore.close(open.current);
    },
    [],
  );

  // On the desk the page never stands empty while there are notes: the first one opens.
  const first = order[0]?.id;
  useEffect(() => {
    if (!phone && !noteId && !trash && first) go(notePath(first), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when what's open or the first note changes
  }, [phone, noteId, trash, first]);

  const nextAfter = (id: string) => {
    const i = order.findIndex((n) => n.id === id);
    const next = order[i + 1] ?? order[i - 1];
    return next && next.id !== id ? next.id : null;
  };
  const editor = useNoteEditor(noteId, {
    compact: phone,
    autoFocus: !!noteId && notebookStore.isDraft(noteId),
    onDeleted: () => {
      const next = noteId ? nextAfter(noteId) : null;
      go(next && !phone ? notePath(next) : NOTEBOOK_PATH, true);
    },
    onBack: (id) => go(notePath(id)),
    openPath: (href) => go(href),
  });

  const newNote = (folder: NoteFolderItem | null) => {
    setDir('in');
    go(notePath(notebookStore.draft({ folderId: folder?.id ?? null })));
  };
  const tree = (
    <NoteTree
      folders={items.folders}
      notes={items.notes}
      active={trash ? 'trash' : noteId}
      trashCount={treeQ.data?.trashCount}
      loading={treeQ.isPending}
      error={treeQ.isError}
      onRetry={() => void treeQ.refetch()}
      onPick={(n) => {
        setDir('in');
        go(notePath(n.id));
      }}
      onNewNote={newNote}
      onCreateFolder={(parentId, name) => {
        const r = notebookStore.createFolder(parentId, name);
        return 'error' in r ? r.error : null;
      }}
      onRenameFolder={(f, name) => notebookStore.renameFolder(f.id, name)?.error ?? null}
      onDeleteFolder={(f) => {
        const data = notebookStore.cachedTree();
        const n = data ? notesBelow(data.folders, data.notes, f.id) : 0;
        const inside = noteId && data?.notes.find((x) => x.id === noteId);
        notebookStore.deleteFolder(f.id);
        showToast(
          n
            ? `Moved “${f.name}” and its ${n === 1 ? 'note' : `${n} notes`} to Trash.`
            : `Deleted “${f.name}”.`,
          { action: 'Undo', onAction: () => notebookStore.restoreFolder(f.id) },
        );
        if (inside && inside.folderId && !notebookStore.cachedTree()?.notes.some((x) => x.id === noteId))
          go(NOTEBOOK_PATH, true);
      }}
      onMoveNote={(id, folderId, index) => notebookStore.moveNote(id, folderId, index)}
      onMoveFolder={(id, parentId, index) => notebookStore.moveFolder(id, parentId, index)}
      onTrash={() => go(TRASH)}
    />
  );

  const trashView = (
    <NoteTrash
      items={(trashQ.data ?? []).map((x) => trashItem(x))}
      loading={trashQ.isPending}
      error={trashQ.isError}
      onRetry={() => void trashQ.refetch()}
      onRestore={(x: NoteTrashItem) => {
        if (x.kind === 'note') notebookStore.restoreNote(x.id);
        else notebookStore.restoreFolder(x.id);
        const place = x.where ? x.where.split(' / ').pop() : null;
        showToast(place ? `Put back in ${place}.` : 'Put back.', {
          action: x.kind === 'note' ? 'Open' : undefined,
          onAction: x.kind === 'note' ? () => go(notePath(x.id)) : undefined,
        });
      }}
      onPurge={(x) => {
        if (x.kind === 'note') notebookStore.purgeNote(x.id);
        else notebookStore.purgeFolder(x.id);
        showToast('Deleted for good.');
      }}
      onEmpty={() => {
        notebookStore.emptyTrash();
        showToast('Trash is empty.');
      }}
    />
  );

  const empty = !treeQ.isPending && !treeQ.isError && !order.length && !noteId;
  const right = trash ? (
    trashView
  ) : noteId ? (
    <NoteEditor key={noteId} {...editor} />
  ) : empty ? (
    <div className="app-nb-blank">
      <EmptyState title="Somewhere to think out loud." action="New note" onAction={() => newNote(null)}>
        Notes, lists, half-ideas. Link a note to any task, in any space. On your Mac, a note can float over
        whatever you’re doing.
      </EmptyState>
    </div>
  ) : treeQ.isError ? null : (
    <NoteEditor loading />
  );

  if (phone)
    return (
      <div className="app-page app-notebook app-notebook-phone">
        {noteId || trash ? (
          <div className="app-nb-top">
            <button
              type="button"
              className="app-nb-back"
              onClick={() => {
                setDir('back');
                go(NOTEBOOK_PATH);
              }}
            >
              <Icon name="left" size={20} />
              <span>Notebook</span>
            </button>
          </div>
        ) : null}
        <div className="tp-sheet app-nb-sheet">
          <div
            key={noteId ?? (trash ? 'trash' : 'list')}
            className={dir === 'in' ? 'app-nb-turn-in' : 'app-nb-turn-back'}
          >
            {noteId || trash ? right : tree}
          </div>
        </div>
      </div>
    );
  return (
    <div className="app-page app-notebook">
      <div className="tp-sheet app-nb-sheet">
        <div className="app-nb-split">
          <div className="app-nb-l">{tree}</div>
          <div className="app-nb-r">{right}</div>
        </div>
      </div>
    </div>
  );
}
