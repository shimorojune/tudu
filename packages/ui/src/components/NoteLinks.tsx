import { useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { IconButton } from './IconButton';
import {
  NotePicker,
  NotePop,
  NoteRow,
  reducedMotion,
  useCloseOnOutside,
  useFlip,
  type NoteItem,
  type PickItem,
} from './NoteParts';
import { Skeleton } from './Skeleton';

export interface NoteLinksProps {
  /** Your notes linked to this task. */
  notes: NoteItem[];
  /** Every note of yours, for Link a note; the ones already linked say so. */
  all?: PickItem[];
  allLoading?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Opens the note in the note window, over the task. */
  onOpen?: (note: NoteItem) => void;
  /** A blank note, already linked to the task, in the note window. */
  onNew?: () => void;
  onLink?: (note: PickItem) => void;
  onUnlink?: (note: NoteItem) => void;
}

/** An unlinked row folds away this long before it leaves. */
export const ROW_OUT_MS = 200;

/**
 * The task panel's notebook section, under Notes: your notes linked to this task. Only you see them, even on a
 * shared task. New note opens the note window on a blank note already linked; Link a note picks one of yours.
 * Clicking a note opens it in the note window over the task, so you never lose your place.
 */
export function NoteLinks(p: NoteLinksProps) {
  const [picking, setPicking] = useState(false);
  const wrap = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  useFlip(list);
  useCloseOnOutside(wrap, picking, () => setPicking(false));
  // Rows there on first show just sit there; a row that arrives later slides in like a new task row.
  const ids = p.notes.map((n) => n.id).join(' ');
  const [seen, setSeen] = useState<{ ids: string; set: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  if (!p.loading && seen?.ids !== ids) {
    const now = new Set(p.notes.map((n) => n.id));
    const added = seen ? [...now].filter((id) => !seen.set.has(id)) : [];
    if (added.length) setFresh(new Set([...fresh, ...added]));
    setSeen({ ids, set: now });
  }
  const unlink = (n: NoteItem) => {
    if (reducedMotion()) return p.onUnlink?.(n);
    setLeaving((l) => ({ ...l, [n.id]: true }));
    setTimeout(() => {
      setLeaving(({ [n.id]: _, ...rest }) => rest);
      p.onUnlink?.(n);
    }, ROW_OUT_MS);
  };
  const linked = new Set(p.notes.map((n) => n.id));
  const all = (p.all ?? []).map((x) => ({ ...x, linked: linked.has(x.key) }));
  return (
    <section ref={wrap} className="tp-root tp-td-sec tp-nb-sec" aria-label="From your notebook">
      <h3 className="tp-td-h">
        From your notebook
        {p.notes.length ? <span>{p.notes.length}</span> : null}
        <em className="tp-nb-private">Only you see these</em>
      </h3>
      {p.loading ? (
        <div aria-label="Loading your notes" aria-busy="true">
          {[200, 150].map((w, i) => (
            <div key={i} className="tp-nb-skrow">
              <Skeleton width={14} height={14} />
              <Skeleton width={w} height={11} />
            </div>
          ))}
        </div>
      ) : p.error ? (
        <p className="tp-nb-quiet tp-nb-err-line" role="alert">
          <span>Your notes for this task didn’t load.</span>
          <button type="button" className="tp-nb-textbtn" onClick={p.onRetry}>
            Try again
          </button>
        </p>
      ) : (
        <div ref={list} className="tp-nb-list">
          {p.notes.map((n) => (
            <div
              key={n.id}
              data-flip={n.id}
              className={cx('tp-nb-li', fresh.has(n.id) && 'tp-nb-li-new', leaving[n.id] && 'tp-nb-li-out')}
            >
              <NoteRow note={n} onPick={() => p.onOpen?.(n)} />
              {p.onUnlink ? (
                <span className="tp-nb-li-acts">
                  <IconButton label="Unlink from this task" tipSide="right" onClick={() => unlink(n)}>
                    <Icon name="x" size={14} />
                  </IconButton>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="tp-nb-sec-acts">
        {p.onNew ? (
          <button type="button" className="tp-nb-addlink" onClick={p.onNew}>
            <Icon name="plus" size={13} />
            New note
          </button>
        ) : null}
        {p.onLink ? (
          <span className="tp-nb-menuw">
            <button
              type="button"
              className={cx('tp-nb-addlink', picking && 'tp-on')}
              onClick={() => setPicking(!picking)}
            >
              <Icon name="link" size={13} />
              Link a note
            </button>
            <NotePop open={picking}>
              <NotePicker
                label="Link a note"
                placeholder="Find a note"
                items={all}
                loading={p.allLoading}
                empty="You have no notes yet. New note makes one linked to this task."
                onClose={() => setPicking(false)}
                onPick={(x) => {
                  setPicking(false);
                  if (!x.linked) p.onLink?.(x);
                }}
              />
            </NotePop>
          </span>
        ) : null}
      </div>
    </section>
  );
}
