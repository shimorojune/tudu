import { useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { IconButton } from './IconButton';
import { NoteIcon, noteLabel, reducedMotion, useFlip } from './NoteParts';
import { Skeleton } from './Skeleton';

/** Something in Trash: a note, or a folder with what went with it. */
export interface NoteTrashItem {
  id: string;
  kind: 'note' | 'folder';
  title: string;
  first?: string;
  /** Where it came from, "Northwind / Planning"; null for no folder. */
  where?: string | null;
  /** "29 days left". */
  left: string;
  /** For a folder: how many notes went with it. */
  notes?: number;
}

export interface NoteTrashProps {
  items: NoteTrashItem[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onRestore?: (item: NoteTrashItem) => void;
  onPurge?: (item: NoteTrashItem) => void;
  onEmpty?: () => void;
}

/** A row leaves this long before it goes from the list. */
export const TRASH_ROW_OUT_MS = 200;

const countWords = (items: NoteTrashItem[]) => {
  const notes = items.reduce((n, x) => n + (x.kind === 'note' ? 1 : (x.notes ?? 0)), 0);
  return notes === 1 ? '1 note' : `${notes} notes`;
};

/**
 * What you deleted, kept 30 days. Put back returns a note where it was (a folder with everything that went with it);
 * Delete now and Empty Trash ask first, since they're the only steps that can't be undone. Rows glide out as they go.
 */
export function NoteTrash(p: NoteTrashProps) {
  const list = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const [ask, setAsk] = useState<NoteTrashItem | 'all' | null>(null);
  useFlip(list);
  const leave = (x: NoteTrashItem, then: () => void) => {
    setLeaving((l) => ({ ...l, [x.id]: true }));
    setTimeout(
      () => {
        setLeaving(({ [x.id]: _, ...rest }) => rest);
        then();
      },
      reducedMotion() ? 0 : TRASH_ROW_OUT_MS,
    );
  };
  const n = p.items.length;
  const noteCount = p.items.reduce((c, x) => c + (x.kind === 'note' ? 1 : (x.notes ?? 0)), 0);
  const asked = ask && ask !== 'all' ? ask : null;
  return (
    <div className="tp-root tp-nb-trashv">
      <ConfirmDialog
        open={!!ask}
        title={ask === 'all' ? 'Empty Trash?' : asked ? `Delete “${noteLabel(asked)}” now?` : ''}
        confirmLabel={ask === 'all' ? 'Empty Trash' : 'Delete now'}
        busyLabel="Deleting…"
        doneLabel="Deleted"
        onClose={() => setAsk(null)}
        onConfirm={() => {
          if (ask === 'all') p.onEmpty?.();
          else if (asked) leave(asked, () => p.onPurge?.(asked));
        }}
      >
        {ask === 'all'
          ? `${noteCount === 1 ? 'The note in Trash goes' : `All ${noteCount} notes in Trash go`} for good, with their links to tasks. The tasks themselves stay as they are.`
          : asked?.kind === 'folder'
            ? 'It goes for good, with everything in it and their links to tasks. The tasks themselves stay as they are.'
            : 'It goes for good, with its links to tasks. The tasks themselves stay as they are.'}
      </ConfirmDialog>
      <div className="tp-nb-trash-h">
        <h2>Trash</h2>
        <span className="tp-nb-quiet">
          {n ? `${countWords(p.items)} · each one is deleted 30 days after you trash it` : ''}
        </span>
        {n ? (
          <Button variant="quiet" size="sm" onClick={() => setAsk('all')}>
            Empty Trash
          </Button>
        ) : null}
      </div>
      {p.loading ? (
        <div className="tp-nb-trash-list" aria-label="Loading Trash" aria-busy="true">
          {[180, 140, 200].map((w, i) => (
            <div key={i} className="tp-nb-skrow">
              <Skeleton width={14} height={14} />
              <Skeleton width={w} height={11} />
            </div>
          ))}
        </div>
      ) : p.error ? (
        <p className="tp-nb-quiet tp-nb-err-line" role="alert">
          <span>Trash didn’t load.</span>
          <button type="button" className="tp-nb-textbtn" onClick={p.onRetry}>
            Try again
          </button>
        </p>
      ) : n ? (
        <div ref={list} className="tp-nb-trash-list">
          {p.items.map((x) => (
            <div key={x.id} data-flip={x.id} className={cx('tp-nb-trrow', leaving[x.id] && 'tp-nb-li-out')}>
              <div className="tp-root tp-nb-row">
                <span className="tp-nb-row-ic">
                  <NoteIcon name={x.kind === 'folder' ? 'folder' : 'note'} size={14} />
                </span>
                <span className="tp-nb-row-m">
                  <span className={cx('tp-nb-row-t', !x.title.trim() && 'tp-nb-untitled')}>
                    {noteLabel(x)}
                  </span>
                  <span className="tp-nb-row-s">
                    {x.where ? `From ${x.where}` : 'Not in a folder'}
                    {x.kind === 'folder' ? ` · ${x.notes === 1 ? '1 note' : `${x.notes ?? 0} notes`}` : ''}
                  </span>
                </span>
              </div>
              <span className="tp-nb-tr-left">{x.left}</span>
              <span className="tp-nb-tr-acts">
                <IconButton label="Put back" tipSide="left" onClick={() => leave(x, () => p.onRestore?.(x))}>
                  <NoteIcon name="putBack" size={15} />
                </IconButton>
                <IconButton label="Delete now" tipSide="left" onClick={() => setAsk(x)}>
                  <Icon name="trash" size={15} />
                </IconButton>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="tp-nb-trash-empty">
          <EmptyState title="Nothing in Trash.">
            Notes you delete stay here for 30 days, then they’re gone.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
