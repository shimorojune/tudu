import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { moveTargets, type NotebookFolder } from '@tudu/core';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { IconButton } from './IconButton';
import { MenuList } from './Menu';
import {
  NoteIcon,
  NotePicker,
  NotePop,
  NoteTaskChip,
  reducedMotion,
  SaveState,
  useCloseOnOutside,
  useFlip,
  type NoteSaveState,
  type NoteTaskItem,
  type PickItem,
} from './NoteParts';
import { RichTextEditor } from './RichTextEditor';
import { Skeleton } from './Skeleton';

/** One note, as the editor shows it. */
export interface NoteEditorNote {
  id: string;
  title: string;
  /** The first line of its words: the title's placeholder while it has none. */
  first?: string;
  html: string;
  folderId: string | null;
  /** The folder names above it, top first. */
  path: string[];
  linked: NoteTaskItem[];
  /** "4m"; none for a new note. */
  edited?: string | null;
  /** A new note nobody has written in yet: not saved, so it has no ⋯ (Move, Delete). */
  draft?: boolean;
  words?: number;
  /** Bumped when the words change under the editor: it starts again with them. */
  gen?: number;
}

export interface NoteEditorProps {
  note?: NoteEditorNote | null;
  loading?: boolean;
  /** This note didn't open (the rest are fine). */
  error?: boolean;
  onRetry?: () => void;
  /** The note window and phones: smaller title, no footer. */
  compact?: boolean;
  autoFocus?: boolean;
  save?: NoteSaveState;
  /** From the store: the save has taken over half a second. */
  slow?: boolean;
  /** Offline or "changed in another window": above the note. */
  banner?: ReactNode;
  /** Every folder, for Move. */
  folders?: NotebookFolder[];
  /** Your tasks from every space, for Link a task. */
  tasks?: PickItem[];
  tasksLoading?: boolean;
  /** The words typed in Link a task, for the app to find tasks by. */
  onTaskQuery?: (q: string) => void;
  onTitle?: (title: string) => void;
  onBody?: (html: string) => void;
  /** Leaving the words or the title: save what's waiting. */
  onLeave?: () => void;
  onMove?: (folderId: string | null, name: string | null) => void;
  /** After it asked and the note faded off the page. */
  onDelete?: () => void;
  onLink?: (task: PickItem) => void;
  onUnlink?: (task: NoteTaskItem) => void;
  onOpenTask?: (task: NoteTaskItem) => void;
  /** Words selected in the note (line breaks kept): New task opens on them. */
  onMakeTask?: (words: string) => void;
  /** ↗ in the browser: the note in its own window. */
  onPop?: () => void;
  popLabel?: string;
  onAttach?: (
    file: File,
    onProgress?: (ratio: number) => void,
  ) => Promise<{ id: string; name: string; size: number }>;
  fileBase?: string;
  offline?: boolean;
  className?: string;
}

/** The note leaves the page this long before the next one takes its place. */
export const NOTE_GOING_MS = 180;
/** An unlinked chip shrinks away this long before it leaves. */
export const CHIP_OUT_MS = 170;

/**
 * Where the Make a task bubble goes, in whole pixels: centred on `x`, its foot on `y`, never closer than 8px to the
 * pane's sides or top. A bubble half a pixel off is drawn off the pixel grid, and its words look soft on the Mac.
 */
export function bubbleSpot(x: number, y: number, width: number, height: number, paneWidth: number) {
  return {
    left: Math.round(Math.max(8, Math.min(paneWidth - width - 8, x - width / 2))),
    top: Math.round(Math.max(8, y - height)),
  };
}

/** The note's linked tasks and its Link button. A new link pops in; an unlinked one shrinks away first. */
function LinkRow({
  links,
  onUnlink,
  onOpen,
  children,
}: {
  links: NoteTaskItem[];
  onUnlink?: (t: NoteTaskItem) => void;
  onOpen?: (t: NoteTaskItem) => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  useFlip(box);
  const unlink = (t: NoteTaskItem) => {
    if (reducedMotion()) return onUnlink?.(t);
    setLeaving((l) => ({ ...l, [t.key]: true }));
    setTimeout(() => {
      setLeaving(({ [t.key]: _, ...rest }) => rest);
      onUnlink?.(t);
    }, CHIP_OUT_MS);
  };
  return (
    <div ref={box} className="tp-nb-links">
      {links.map((t) => (
        <span key={t.key} data-flip={t.key} className={cx('tp-nb-flip', leaving[t.key] && 'tp-nb-leaving')}>
          <NoteTaskChip
            task={t}
            onOpen={onOpen ? () => onOpen(t) : undefined}
            onUnlink={onUnlink ? () => unlink(t) : undefined}
          />
        </span>
      ))}
      <span data-flip="+link" className="tp-nb-flip">
        {children}
      </span>
    </div>
  );
}

/**
 * One note: where it lives, how it's saving, its title, the tasks it's linked to, then the words. Only the words
 * scroll. Select some words and a small "Make a task" button rises above them. ⋯ has Move and Delete; Delete asks
 * first, then the note fades off the page.
 */
export function NoteEditor(p: NoteEditorProps) {
  const note = p.note;
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [moving, setMoving] = useState(false);
  const [going, setGoing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState(note?.title ?? '');
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string } | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const id = note?.id;
  const gen = note?.gen ?? 0;

  // Another note (or the same one changed elsewhere): start clean.
  const [seen, setSeen] = useState(`${id}:${gen}`);
  if (seen !== `${id}:${gen}`) {
    setSeen(`${id}:${gen}`);
    setTitle(note?.title ?? '');
    setMenu(false);
    setPicking(false);
    setMoving(false);
    setGoing(false);
    setBubble(null);
  }

  const closeAll = () => {
    setMenu(false);
    setPicking(false);
    setMoving(false);
  };
  useCloseOnOutside(wrap, menu || picking || moving, closeAll);

  // Select some words in the note and a small "Make a task" button rises above them.
  const makeTask = p.onMakeTask;
  useEffect(() => {
    if (!makeTask) return;
    function check() {
      const el = wrap.current;
      const sel = window.getSelection();
      if (!el) return;
      const area = el.querySelector('.tp-rte-area');
      const text = sel?.toString().trim() ?? '';
      if (!sel || sel.isCollapsed || !sel.rangeCount || !area || !area.contains(sel.anchorNode) || !text) {
        setBubble(null);
        return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const x = r.left + r.width / 2 - b.left;
      const y = r.top - b.top;
      setBubble({
        x: Math.max(70, Math.min(el.offsetWidth - 70, x)),
        y: Math.max(8, y - 8),
        // The words as selected, line breaks kept: the first line becomes the task, the rest its note.
        text,
      });
    }
    document.addEventListener('selectionchange', check);
    return () => document.removeEventListener('selectionchange', check);
  }, [makeTask]);
  // Placed once it has measured itself, before it paints, so it never shows at a wrong spot.
  const bubbleEl = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = bubbleEl.current;
    const pane = wrap.current;
    if (!el || !pane || !bubble) return;
    const at = bubbleSpot(bubble.x, bubble.y, el.offsetWidth, el.offsetHeight, pane.offsetWidth);
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
  }, [bubble]);

  if (p.loading)
    return (
      <div
        className={cx('tp-root tp-nb-ed', p.compact && 'tp-compact', p.className)}
        aria-label="Opening the note"
        aria-busy="true"
      >
        <div className="tp-nb-ed-top">
          <Skeleton width={120} height={10} />
        </div>
        <div className="tp-nb-ed-in">
          <Skeleton width={280} height={26} />
          <div style={{ height: 22 }} />
          {[92, 80, 96, 60, 88].map((w, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <Skeleton width={`${w}%`} height={12} />
            </div>
          ))}
        </div>
      </div>
    );
  if (p.error || !note)
    return (
      <div className={cx('tp-root tp-nb-ed tp-nb-ed-err', p.compact && 'tp-compact', p.className)}>
        <EmptyState tone="error" title="This note didn’t open." action="Try again" onAction={p.onRetry}>
          Nothing in it is lost. It opens again once Tudu reaches the server.
        </EmptyState>
      </div>
    );

  const links = note.linked;
  const name = note.title.trim() || note.first?.trim() || 'this note';
  const crumb = note.path.join('  /  ');
  const spots: PickItem[] = moveTargets(p.folders ?? [], note.folderId).map((t) => ({
    key: t.key,
    title: t.title,
    sub: t.sub,
    icon: t.folderId ? 'folder' : 'note',
    here: t.here,
  }));
  const tasks = (p.tasks ?? []).map((t) => ({ ...t, linked: links.some((l) => l.key === t.key) }));
  const remove = () => {
    setGoing(true);
    setTimeout(() => p.onDelete?.(), reducedMotion() ? 0 : NOTE_GOING_MS);
  };
  const foot = `${note.edited ? `Edited ${note.edited}` : 'New'}${note.words ? ` · ${note.words} ${note.words === 1 ? 'word' : 'words'}` : ''} · Only you see this note`;

  return (
    <div
      ref={wrap}
      className={cx('tp-root tp-nb-ed', p.compact && 'tp-compact', going && 'tp-nb-ed-going', p.className)}
    >
      <ConfirmDialog
        open={asking}
        title={`Delete “${name}”?`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        doneLabel="Deleted"
        onClose={() => setAsking(false)}
        onConfirm={remove}
      >
        {`It goes to Trash for 30 days, then it’s gone for good. Until then you can put it back from Trash.${links.length ? ' Its links to tasks come back with it.' : ''}`}
      </ConfirmDialog>
      {p.banner ?? null}
      {bubble && p.onMakeTask ? (
        <div ref={bubbleEl} className="tp-nb-bubble">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const words = bubble.text;
              setBubble(null);
              try {
                window.getSelection()?.removeAllRanges();
              } catch {
                /* fine */
              }
              p.onMakeTask?.(words);
            }}
          >
            <Icon name="plus" size={13} />
            Make a task
          </button>
        </div>
      ) : null}
      <div className="tp-nb-ed-top">
        <span className="tp-nb-crumb">
          {crumb ? (
            <>
              <NoteIcon name="folder" size={12} />
              <span>{crumb}</span>
            </>
          ) : (
            'Notebook'
          )}
        </span>
        <SaveState state={p.save} slow={p.slow} />
        {p.onPop ? (
          <IconButton label={p.popLabel ?? 'Open in its own window'} tipSide="bottom" onClick={p.onPop}>
            <Icon name="external" size={16} />
          </IconButton>
        ) : null}
        {/* A new note nobody has written in isn't saved yet: nothing to move or delete. The ⋯ keeps its place,
            hidden, and arrives with the first character. */}
        <span
          className={cx('tp-nb-menuw tp-nb-more', note.draft && 'tp-nb-more-hide')}
          aria-hidden={note.draft ? 'true' : undefined}
          inert={note.draft || undefined}
        >
          <IconButton
            label="More"
            tipSide="bottom-end"
            className={menu || moving ? 'tp-on' : undefined}
            onClick={() => {
              setMenu(!(menu || moving));
              setMoving(false);
              setPicking(false);
            }}
          >
            <Icon name="more" size={16} />
          </IconButton>
          <NotePop open={menu} className="tp-nb-pop-r">
            <MenuList
              label="Note options"
              items={[
                {
                  label: 'Move',
                  onSelect: () => {
                    setMenu(false);
                    setMoving(true);
                    setPicking(false);
                  },
                },
                {
                  label: 'Delete',
                  danger: true,
                  onSelect: () => {
                    setMenu(false);
                    setAsking(true);
                  },
                },
              ]}
            />
          </NotePop>
          <NotePop open={moving} className="tp-nb-pop-r">
            <NotePicker
              className="tp-nb-movepick"
              label="Move to a folder"
              placeholder="Find a folder"
              items={spots}
              max={12}
              empty="No folders yet."
              onClose={() => setMoving(false)}
              onPick={(x) => {
                setMoving(false);
                const t = moveTargets(p.folders ?? [], note.folderId).find((m) => m.key === x.key);
                p.onMove?.(t?.folderId ?? null, t?.folderId ? t.title : null);
              }}
            />
          </NotePop>
        </span>
      </div>
      <div className="tp-nb-ed-in">
        <input
          className="tp-nb-title"
          value={title}
          placeholder={note.first || 'Untitled'}
          aria-label="Note title"
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            p.onTitle?.(e.target.value);
          }}
          onBlur={p.onLeave}
        />
        <LinkRow links={links} onUnlink={p.onUnlink} onOpen={p.onOpenTask}>
          {p.onLink ? (
            <span className="tp-nb-menuw">
              <button
                type="button"
                className={cx('tp-nb-addlink', picking && 'tp-on')}
                onClick={() => {
                  setPicking(!picking);
                  setMenu(false);
                  setMoving(false);
                }}
              >
                <Icon name="link" size={13} />
                {links.length ? 'Link' : 'Link a task'}
              </button>
              <NotePop open={picking}>
                <NotePicker
                  label="Link a task"
                  placeholder="Find a task in any space"
                  items={tasks}
                  loading={p.tasksLoading}
                  onQuery={p.onTaskQuery}
                  empty="Your tasks from every space show here."
                  onClose={() => setPicking(false)}
                  onPick={(t) => {
                    setPicking(false);
                    if (!t.linked) p.onLink?.(t);
                  }}
                />
              </NotePop>
            </span>
          ) : null}
        </LinkRow>
        <div className="tp-nb-body">
          <RichTextEditor
            variant="notes"
            label="Note"
            resetKey={`${note.id}:${gen}`}
            value={note.html}
            placeholder="Write anything. It saves as you go."
            compact={p.compact}
            autoFocus={p.autoFocus}
            onInput={(html) => p.onBody?.(html)}
            onBlur={() => p.onLeave?.()}
            onAttach={p.onAttach}
            fileBase={p.fileBase}
            offline={p.offline}
          />
        </div>
      </div>
      {p.compact ? null : <div className="tp-nb-ed-foot">{foot}</div>}
    </div>
  );
}
