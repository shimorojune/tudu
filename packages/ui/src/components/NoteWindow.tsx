import { Dialog as RadixDialog } from 'radix-ui';
import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { IconButton } from './IconButton';
import { Logo } from './Logo';
import { NoteIcon, NoteRow, type NoteItem } from './NoteParts';
import { NoteTree, type NoteFolderItem } from './NoteTree';
import { Segmented } from './Segmented';
import { Skeleton } from './Skeleton';

export interface NoteWindowProps {
  /** The Mac's own window (pin, fill the screen, resize), or the browser's panel and popup (↗). */
  variant?: 'mac' | 'web';
  /** The list down the left starts shown. */
  rail?: boolean;
  /** The open note's id, or `new` for the blank note it opens on. */
  active: string;
  /** The open note is the blank one it opened on (New note in the bar and the list), even once it has an id. */
  blank?: boolean;
  /** The open note's title (or first line) for the bar. */
  title?: string;
  recent?: NoteItem[];
  recentLoading?: boolean;
  /** All notes: the whole tree. */
  tree?: { folders: NoteFolderItem[]; notes: NoteItem[]; defaultOpen?: Record<string, boolean> };
  treeLoading?: boolean;
  pinned?: boolean;
  expanded?: boolean;
  /** What the open button says: "Open in your Notebook" (Mac), "Open in its own window" (↗ on the web). */
  openLabel?: string;
  /** The note, on the right. */
  children?: ReactNode;
  className?: string;
  onPick?: (id: string) => void;
  onNew?: () => void;
  onPin?: () => void;
  onExpand?: () => void;
  onOpenApp?: () => void;
  onClose?: () => void;
  /** The bar is the handle: drag the window by it. */
  onDragStart?: (e: PointerEvent<HTMLElement>) => void;
  /** The corner grip (Mac). */
  onResizeStart?: (e: PointerEvent<HTMLElement>) => void;
}

/**
 * The small window for writing without the desk: a bar to drag it by, your notes down the left (Recent, or All
 * notes with Find), the note on the right. On the Mac it floats over every app: Pin keeps it above them (off to
 * start), the arrows fill the screen. In the browser it floats over the page and ↗ opens it in its own popup.
 */
export function NoteWindow(p: NoteWindowProps) {
  const web = p.variant === 'web';
  const [rail, setRail] = useState(p.rail !== false);
  const [view, setView] = useState<'recent' | 'all'>('recent');
  const [swapped, setSwapped] = useState(false);
  const [cur, setCur] = useState(0);
  const recent = p.recent ?? [];
  const opts = ['new', ...recent.map((n) => n.id)];
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCur((cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const id = opts[cur]!;
      if (id === 'new') p.onNew?.();
      else p.onPick?.(id);
    }
  };
  const blank = p.blank ?? p.active === 'new';
  const barTitle = blank && !p.title ? 'New note' : p.title || 'Untitled';
  return (
    <section
      className={cx(
        'tp-root tp-nb-win',
        p.expanded && 'tp-nb-max',
        p.pinned && 'tp-nb-pinned',
        web && 'tp-nb-web',
        p.className,
      )}
      aria-label="Notebook"
    >
      <header
        className="tp-nb-win-bar"
        onPointerDown={p.onDragStart}
        onDoubleClick={web ? undefined : p.onExpand}
      >
        <IconButton
          label={rail ? 'Hide the list' : 'Show your notes'}
          tipSide="bottom"
          className={rail ? 'tp-on' : undefined}
          onClick={() => setRail(!rail)}
        >
          <Icon name="panel" size={15} />
        </IconButton>
        <span className="tp-nb-win-title">
          <span key={`${p.active}:${barTitle}`}>{barTitle}</span>
        </span>
        {web ? null : (
          <IconButton
            label={p.pinned ? 'Pinned on top · click to unpin' : 'Keep on top of other windows'}
            tipSide="bottom"
            className={cx('tp-nb-pinbtn', p.pinned && 'tp-on')}
            aria-pressed={p.pinned ? 'true' : 'false'}
            onClick={p.onPin}
          >
            <NoteIcon name="pin" size={15} />
          </IconButton>
        )}
        {web ? null : (
          <IconButton
            label={p.expanded ? 'Back to its size' : 'Fill the screen'}
            tipSide="bottom"
            aria-pressed={p.expanded ? 'true' : 'false'}
            onClick={p.onExpand}
          >
            <NoteIcon name={p.expanded ? 'shrink' : 'expand'} size={15} />
          </IconButton>
        )}
        {p.onOpenApp ? (
          <IconButton
            label={p.openLabel ?? (web ? 'Open in its own window' : 'Open in your Notebook')}
            tipSide="bottom"
            className={web ? undefined : 'tp-nb-opentudu'}
            onClick={p.onOpenApp}
          >
            {web ? <Icon name="external" size={15} /> : <Logo size={15} />}
          </IconButton>
        ) : null}
        <IconButton label="Close" tipSide="bottom-end" onClick={p.onClose}>
          <Icon name="x" size={15} />
        </IconButton>
      </header>
      <div className="tp-nb-win-b">
        <aside className={cx('tp-nb-rail', !rail && 'tp-off')} aria-hidden={rail ? undefined : 'true'}>
          <div className="tp-nb-rail-in">
            {p.tree ? (
              <div className="tp-nb-rail-seg">
                <Segmented
                  label="Show"
                  value={view}
                  onChange={(v) => {
                    setSwapped(true);
                    setView(v);
                  }}
                  items={[
                    { value: 'recent', label: 'Recent' },
                    { value: 'all', label: 'All notes' },
                  ]}
                />
              </div>
            ) : null}
            {view === 'all' && p.tree ? (
              <div key="all" className={cx('tp-nb-rail-all', swapped && 'tp-nb-rail-from-r')}>
                <NoteTree
                  bare
                  folders={p.tree.folders}
                  notes={p.tree.notes}
                  defaultOpen={p.tree.defaultOpen}
                  loading={p.treeLoading}
                  active={p.active}
                  onPick={(n) => p.onPick?.(n.id)}
                />
              </div>
            ) : (
              <div
                key="recent"
                className={cx('tp-nb-rail-list', swapped && 'tp-nb-rail-from-l')}
                role="listbox"
                aria-label="New note or a recent note"
                tabIndex={0}
                aria-activedescendant={`nbw-o${cur}`}
                onKeyDown={key}
              >
                <button
                  type="button"
                  role="option"
                  id="nbw-o0"
                  tabIndex={-1}
                  aria-selected={blank ? 'true' : 'false'}
                  className={cx('tp-root tp-nb-row tp-nb-newrow', blank && 'tp-on', cur === 0 && 'tp-cur')}
                  onMouseMove={() => setCur(0)}
                  onClick={p.onNew}
                >
                  <span className="tp-nb-row-ic">
                    <Icon name="plus" size={14} />
                  </span>
                  <span className="tp-nb-row-m">
                    <span className="tp-nb-row-t">New note</span>
                  </span>
                </button>
                {p.recentLoading ? (
                  [120, 150, 100].map((w, i) => (
                    <div key={i} className="tp-nb-skrow">
                      <Skeleton width={14} height={14} />
                      <Skeleton width={w} height={11} />
                    </div>
                  ))
                ) : recent.length ? (
                  <>
                    <div className="tp-nb-loose-h">Recent</div>
                    {recent.map((n, i) => (
                      <NoteRow
                        key={n.id}
                        id={`nbw-o${i + 1}`}
                        role="option"
                        note={n}
                        active={!blank && p.active === n.id}
                        className={cur === i + 1 ? 'tp-cur' : undefined}
                        onHover={() => cur !== i + 1 && setCur(i + 1)}
                        onPick={() => p.onPick?.(n.id)}
                      />
                    ))}
                  </>
                ) : (
                  <p className="tp-nb-rail-empty">Notes you write show up here, newest first.</p>
                )}
              </div>
            )}
          </div>
        </aside>
        <div className="tp-nb-win-ed">
          <div key={p.active} className="tp-nb-turn">
            {p.children}
          </div>
        </div>
      </div>
      {web ? null : <span className="tp-nb-grip" aria-hidden="true" onPointerDown={p.onResizeStart} />}
    </section>
  );
}

/** The floating note window leaves this long (it sinks back a touch quicker than it rose). */
export const FLOAT_LEAVE_MS = 180;

/**
 * The note window floating over the page (the browser): a layer of its own above everything, even an open task
 * panel, that never traps the keyboard, never closes on a click outside or on Esc, and fades up with a hair of
 * scale (220ms) and sinks back as it closes (180ms).
 */
export function NoteFloat({
  open,
  style,
  className,
  children,
}: {
  open: boolean;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (open && (!mounted || leaving)) {
    setMounted(true);
    setLeaving(false);
  }
  if (!open && mounted && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, FLOAT_LEAVE_MS);
    return () => clearTimeout(t);
  }, [leaving]);
  if (!mounted) return null;
  return (
    <RadixDialog.Root open modal={false}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          asChild
          aria-label="Notebook"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className={cx('tp-root tp-nb-float', leaving && 'tp-nb-float-out', className)} style={style}>
            <RadixDialog.Title className="sr-only">Notebook</RadixDialog.Title>
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
