import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { canDrop, type DropTarget, type NotebookFolder, type NoteHeader } from '@tudu/core';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { FilterField } from './FilterField';
import { IconButton } from './IconButton';
import { MenuList } from './Menu';
import {
  NoteIcon,
  NotePop,
  NoteRow,
  noteLabel,
  reducedMotion,
  useCloseOnOutside,
  type NoteItem,
} from './NoteParts';
import { Skeleton } from './Skeleton';
import { showToast } from './Toast';

/** A folder as the tree draws it: its folders, then its notes, in order. */
export interface NoteFolderItem {
  id: string;
  name: string;
  folders: NoteFolderItem[];
  notes: NoteItem[];
}

export interface NoteTreeProps {
  folders: NoteFolderItem[];
  /** Notes in no folder. */
  notes: NoteItem[];
  /** The open note, or `trash`. */
  active?: string | null;
  /** Folders open to start with. The folders holding the open note open by themselves. */
  defaultOpen?: Record<string, boolean>;
  trashCount?: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** The window's All notes list: no heading, no New, no Trash. */
  bare?: boolean;
  /** The kit: Find starts with these words. */
  initialQuery?: string;
  className?: string;
  onPick?: (note: NoteItem) => void;
  /** New note: in a folder, or in none (null). */
  onNewNote?: (folder: NoteFolderItem | null) => void;
  /** Name a new folder: return the line to show under the field when the name can't be used, else nothing. */
  onCreateFolder?: (parentId: string | null, name: string) => string | null | void;
  onRenameFolder?: (folder: NoteFolderItem, name: string) => string | null | void;
  onDeleteFolder?: (folder: NoteFolderItem) => void;
  /** A drop: the note into a folder (null for none), at an index among its notes (the end when left out). */
  onMoveNote?: (noteId: string, folderId: string | null, index?: number) => void;
  onMoveFolder?: (folderId: string, parentId: string | null, index?: number) => void;
  onTrash?: () => void;
}

interface Drag {
  kind: 'note' | 'folder';
  id: string;
}
interface Over extends DropTarget {
  bad?: boolean;
}
/** The row you carry, drawn as a small card that follows the pointer, then flies to where it lands (or back home). */
interface Ghost {
  kind: Drag['kind'];
  label: string;
  x: number;
  y: number;
  w: number;
  touch: boolean;
  /** Set once you let go: the row it flies to, measured after the list redraws. */
  to?: { kind: Drag['kind']; id: string; sink?: boolean };
  placed?: boolean;
}

/** The tree as flat lists, for the depth rule. */
function flatten(folders: NoteFolderItem[], loose: NoteItem[]) {
  const fs: NotebookFolder[] = [];
  const ns: NoteHeader[] = [];
  const walk = (list: NoteFolderItem[], parentId: string | null) =>
    list.forEach((f, i) => {
      fs.push({ id: f.id, parentId, name: f.name, position: i });
      f.notes.forEach((n, j) => ns.push(header(n, f.id, j)));
      walk(f.folders, f.id);
    });
  walk(folders, null);
  loose.forEach((n, j) => ns.push(header(n, null, j)));
  return { fs, ns };
}
const header = (n: NoteItem, folderId: string | null, position: number): NoteHeader => ({
  id: n.id,
  folderId,
  title: n.title,
  first: n.first ?? '',
  position,
  updatedAt: '',
  links: n.links ?? 0,
});

export function countNotes(f: NoteFolderItem): number {
  return f.notes.length + f.folders.reduce((n, c) => n + countNotes(c), 0);
}

function matches(n: NoteItem, q: string): boolean {
  return !q || noteLabel(n).toLowerCase().includes(q);
}

function prune(folders: NoteFolderItem[], q: string): NoteFolderItem[] {
  return folders.flatMap((f) => {
    const kids = prune(f.folders, q);
    const notes = f.notes.filter((n) => matches(n, q));
    return kids.length || notes.length || f.name.toLowerCase().includes(q)
      ? [{ ...f, folders: kids, notes }]
      : [];
  });
}

/** The folders above a note, so they open to show it. */
function ancestors(folders: NoteFolderItem[], id: string, above: string[] = []): string[] | null {
  for (const f of folders) {
    if (f.notes.some((n) => n.id === id) || f.id === id) return [...above, f.id];
    const hit = ancestors(f.folders, id, [...above, f.id]);
    if (hit) return hit;
  }
  return null;
}

/** How long a row that landed keeps its glow. */
export const LANDED_MS = 700;
/** Touch: how long you hold a row before it lifts. Moving further than HOLD_SLOP first means you're scrolling. */
export const HOLD_MS = 380;
const HOLD_SLOP = 8;
/** Mouse: how far you move with the button down before the row lifts (less is a click). */
const LIFT_PX = 4;
/** Hold a row over a closed folder this long and the folder opens. */
export const SPRING_MS = 600;
/** How long the card takes to fly to its row. */
export const GLIDE_MS = 220;
/** Near the list's top or bottom edge, it scrolls by itself. */
const EDGE_PX = 36;

interface Common {
  openIds: Record<string, boolean>;
  filtering: boolean;
  toggle: (id: string) => void;
  open: (id: string) => void;
  active?: string | null;
  p: NoteTreeProps;
  drag: Drag | null;
  over: Over | null;
  landed: string | null;
  adding: string | null | undefined;
  setAdding: (parent: string | null | undefined) => void;
  /** Press on a row: a mouse lifts it after a few pixels, a finger after a short hold. */
  down: (e: ReactPointerEvent, kind: Drag['kind'], id: string, label: string) => void;
  /** The row the card is flying to: hidden until it lands. */
  flying: string | null;
}

/** A name typed in place: a new folder's, or a rename. Enter keeps it, Esc goes back. */
function NameField({
  initial,
  depth,
  onDone,
}: {
  initial: string;
  depth: number;
  onDone: (name: string | null) => string | null | void;
}) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (keep: boolean) => {
    if (done.current) return;
    const v = name.trim();
    if (!keep || !v || v === initial) {
      done.current = true;
      onDone(null);
      return;
    }
    const bad = onDone(v);
    if (bad) setErr(bad);
    else done.current = true;
  };
  return (
    <>
      <div className="tp-nb-frow tp-nb-frow-busy" style={{ '--nb-depth': depth } as React.CSSProperties}>
        <div className="tp-nb-ftog tp-nb-frename">
          <span className="tp-nb-chev">
            <NoteIcon name="chev" size={13} />
          </span>
          <span className="tp-nb-row-ic">
            <NoteIcon name="folder" size={14} />
          </span>
          <input
            ref={field}
            className={cx('tp-nb-fname-in', err && 'tp-bad')}
            value={name}
            maxLength={80}
            aria-label="Folder name"
            aria-invalid={err ? 'true' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                finish(true);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish(false);
              }
            }}
            onBlur={() => {
              // A name that can't be used goes back to what it was when you click away.
              if (err) finish(false);
              else finish(true);
            }}
          />
        </div>
      </div>
      {err ? (
        <div
          className="tp-help tp-nb-fname-err"
          role="alert"
          style={{ '--nb-depth': depth } as React.CSSProperties}
        >
          <Icon name="error" size={13} stroke={2.2} />
          {err}
        </div>
      ) : null}
    </>
  );
}

function Folder({ folder: f, depth, c }: { folder: NoteFolderItem; depth: number; c: Common }) {
  const open = !!c.openIds[f.id] || c.filtering;
  const count = f.notes.length + f.folders.length;
  const over = c.over && c.over.id === f.id ? c.over : null;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [asking, setAsking] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  useCloseOnOutside(wrap, menu, () => setMenu(false));
  const inside = countNotes(f);
  const items = [
    {
      label: 'Rename',
      onSelect: () => {
        setMenu(false);
        setRenaming(true);
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
  ];
  const zone = over ? `tp-nb-drop-${over.zone}` : null;
  return (
    <div className={cx('tp-nb-f', c.drag?.id === f.id && 'tp-nb-dragging')}>
      <ConfirmDialog
        open={asking}
        title={`Delete “${f.name}”?`}
        confirmLabel="Delete"
        busyLabel="Deleting…"
        doneLabel="Deleted"
        onClose={() => setAsking(false)}
        onConfirm={() => c.p.onDeleteFolder?.(f)}
      >
        {inside
          ? `The folder and its ${inside === 1 ? 'note goes' : `${inside} notes go`} to Trash for 30 days, then they’re gone for good. Until then you can put them back from Trash.`
          : 'It’s empty, so nothing else goes with it.'}
      </ConfirmDialog>
      {renaming ? (
        <NameField
          initial={f.name}
          depth={depth}
          onDone={(name) => {
            if (name === null) {
              setRenaming(false);
              return null;
            }
            const bad = c.p.onRenameFolder?.(f, name);
            if (!bad) setRenaming(false);
            return bad;
          }}
        />
      ) : (
        <div
          className={cx(
            'tp-nb-frow',
            open && 'tp-open',
            menu && 'tp-nb-frow-busy',
            zone,
            over?.bad && 'tp-nb-nodrop',
            c.landed === f.id && 'tp-nb-landed',
            c.flying === f.id && 'tp-nb-flying',
          )}
          style={{ '--nb-depth': depth } as React.CSSProperties}
          role="treeitem"
          aria-expanded={open}
          aria-level={depth + 1}
          data-nb-kind="folder"
          data-nb-id={f.id}
          onPointerDown={c.filtering ? undefined : (e) => c.down(e, 'folder', f.id, f.name)}
        >
          <button
            type="button"
            className="tp-nb-ftog"
            aria-expanded={open ? 'true' : 'false'}
            onClick={() => c.toggle(f.id)}
            onDoubleClick={() => setRenaming(true)}
          >
            <span className="tp-nb-chev">
              <NoteIcon name="chev" size={13} />
            </span>
            <span className="tp-nb-row-ic">
              <NoteIcon name="folder" size={14} />
            </span>
            <span className="tp-nb-fname">{f.name}</span>
            {over?.bad ? (
              <span className="tp-nb-nodrop-l">Too deep</span>
            ) : (
              <span className="tp-nb-fcount">{count || ''}</span>
            )}
          </button>
          <span className="tp-nb-fadd">
            {depth < 2 && c.p.onCreateFolder ? (
              <IconButton
                label={`New folder in ${f.name}`}
                tipSide="right"
                onClick={() => {
                  c.open(f.id);
                  c.setAdding(f.id);
                }}
              >
                <NoteIcon name="folderPlus" size={14} />
              </IconButton>
            ) : null}
            {c.p.onNewNote ? (
              <IconButton label={`New note in ${f.name}`} tipSide="right" onClick={() => c.p.onNewNote?.(f)}>
                <Icon name="plus" size={14} />
              </IconButton>
            ) : null}
            <span ref={wrap} className="tp-nb-menuw">
              <IconButton
                label="More"
                tipSide="right"
                className={menu ? 'tp-on' : undefined}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="more" size={14} />
              </IconButton>
              <NotePop open={menu} className="tp-nb-pop-r tp-nb-fmenu">
                <MenuList label={`${f.name} options`} items={items} />
              </NotePop>
            </span>
          </span>
        </div>
      )}
      <div className={cx('tp-nb-kids', open && 'tp-open')} role="group">
        <div>
          {f.folders.map((k) => (
            <Folder key={k.id} folder={k} depth={depth + 1} c={c} />
          ))}
          {c.adding === f.id ? (
            <NameField
              initial=""
              depth={depth + 1}
              onDone={(name) => {
                if (name === null) {
                  c.setAdding(undefined);
                  return null;
                }
                const bad = c.p.onCreateFolder?.(f.id, name);
                if (!bad) c.setAdding(undefined);
                return bad;
              }}
            />
          ) : null}
          {f.notes.map((n) => (
            <TreeNote key={n.id} note={n} depth={depth + 1} c={c} />
          ))}
          {!count && c.adding !== f.id ? (
            <p
              className="tp-nb-fempty"
              data-nb-kind="folder"
              data-nb-id={f.id}
              data-nb-into=""
              style={{ '--nb-depth': depth + 1 } as React.CSSProperties}
            >
              Empty folder
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A note in the tree: just its mark and its title. Links and times live in the note itself. */
function TreeNote({ note, depth, c }: { note: NoteItem; depth: number; c: Common }) {
  const over = c.over && c.over.id === note.id ? c.over : null;
  return (
    <div
      className={cx(
        'tp-nb-tp',
        over && `tp-nb-drop-${over.zone}`,
        c.drag?.id === note.id && 'tp-nb-dragging',
        c.landed === note.id && 'tp-nb-landed',
        c.flying === note.id && 'tp-nb-flying',
      )}
      style={{ '--nb-depth': depth } as React.CSSProperties}
      role="treeitem"
      aria-level={depth + 1}
      data-nb-kind="note"
      data-nb-id={note.id}
      onPointerDown={c.filtering ? undefined : (e) => c.down(e, 'note', note.id, noteLabel(note))}
    >
      <NoteRow
        note={note}
        depth={depth}
        active={c.active === note.id}
        sub={false}
        time={false}
        links={false}
        onPick={() => c.p.onPick?.(note)}
      />
    </div>
  );
}

/**
 * The left side of the Notebook page: folders first (three levels at most), then the notes in no folder (they sit at
 * the top of the Notebook, after a hairline), then Trash. "Find a note" narrows it as you type, opening the folders
 * that hold a match. Every row drags: a note onto a folder goes into it, between notes it slots in; a folder goes into
 * another or between folders, as long as nothing ends up deeper than three levels.
 *
 * The tree carries rows itself with pointer events, not the browser's drag and drop: the Mac app's window never hands
 * those to the page, and touch has none. The row lifts as a card that follows the pointer, then glides to where it
 * lands, which glows once. Esc, or a drop nothing takes, glides it home.
 */
export function NoteTree(p: NoteTreeProps) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(p.defaultOpen ?? {});
  const [q, setQ] = useState(p.initialQuery ?? '');
  const ql = q.trim().toLowerCase();
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLSpanElement | null>(null);
  useCloseOnOutside(newRef, newOpen, () => setNewOpen(false));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  // undefined: not adding; null: a new folder at the top; an id: inside that folder.
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const lt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nav = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (lt.current) clearTimeout(lt.current);
      stop.current?.();
    },
    [],
  );

  // The folders holding the open note open by themselves.
  const active = p.active;
  const want = active && active !== 'trash' ? (ancestors(p.folders, active) ?? []).join(' ') : '';
  const [opened, setOpened] = useState('');
  if (want !== opened) {
    setOpened(want);
    const up = want ? want.split(' ') : [];
    if (up.length && !up.every((id) => openIds[id]))
      setOpenIds({ ...openIds, ...Object.fromEntries(up.map((id) => [id, true])) });
  }

  const toggle = (id: string) => setOpenIds((o) => ({ ...o, [id]: !o[id] }));
  const open = (id: string) => setOpenIds((o) => ({ ...o, [id]: true }));
  const flat = flatten(p.folders, p.notes);

  /** Where a drop lands: the new parent and the index among its rows. */
  function place(d: Drag, o: Over): { parent: string | null; index?: number } {
    const fl = live.current.flat;
    if (o.kind === 'root') return { parent: null };
    if (o.kind === 'folder' && o.zone === 'into') return { parent: o.id };
    if (o.kind === 'folder') {
      const parent = fl.fs.find((f) => f.id === o.id)?.parentId ?? null;
      const sibs = fl.fs.filter((f) => f.parentId === parent && f.id !== d.id);
      const i = sibs.findIndex((f) => f.id === o.id);
      return { parent, index: i + (o.zone === 'after' ? 1 : 0) };
    }
    const target = fl.ns.find((n) => n.id === o.id);
    const parent = target?.folderId ?? null;
    const sibs = fl.ns.filter((n) => n.folderId === parent && n.id !== d.id);
    const i = sibs.findIndex((n) => n.id === o.id);
    return { parent, index: i + (o.zone === 'after' ? 1 : 0) };
  }

  // What the listeners read: always the latest render's.
  const live = useRef({ flat, openIds, p });
  useLayoutEffect(() => {
    live.current = { flat, openIds, p };
  });
  // What is being carried and where it would land, as the listeners set it.
  const carry = useRef<{ drag: Drag | null; over: Over | null }>({ drag: null, over: null });

  /** The tree's own pixels: a board may draw it scaled. */
  const scale = () => {
    const n = nav.current;
    return n ? n.getBoundingClientRect().width / (n.offsetWidth || 1) || 1 : 1;
  };
  const local = (x: number, y: number) => {
    const r = nav.current!.getBoundingClientRect();
    const k = scale();
    return { x: (x - r.left) / k, y: (y - r.top) / k };
  };
  const boxOf = (el: Element) => {
    const r = el.getBoundingClientRect();
    const at = local(r.left, r.top);
    return { x: at.x, y: at.y, w: r.width / scale() };
  };

  /** What the pointer is over and where in it, or null when nothing there takes the row. */
  function aim(x: number, y: number): Over | null {
    const d = carry.current.drag;
    const fl = live.current.flat;
    if (!d || !nav.current) return null;
    const el = document.elementFromPoint(x, y);
    const t = el?.closest<HTMLElement>('[data-nb-kind]');
    if (!t || !nav.current.contains(t)) return null;
    const kind = t.dataset.nbKind as Over['kind'];
    const id = t.dataset.nbId ?? null;
    const r = t.getBoundingClientRect();
    const f = r.height ? (y - r.top) / r.height : 0.5;
    let zone: Over['zone'];
    if (kind === 'root') zone = 'root';
    else if (kind === 'folder')
      zone =
        d.kind === 'note' || t.dataset.nbInto !== undefined
          ? 'into'
          : f < 0.28
            ? 'before'
            : f > 0.72
              ? 'after'
              : 'into';
    else {
      if (d.kind === 'folder') return null;
      zone = f < 0.5 ? 'before' : 'after';
    }
    const o: Over = { kind, id, zone };
    if (canDrop(fl.fs, fl.ns, d, o)) return o;
    // Too deep: the folder says so and takes nothing.
    if (kind === 'folder' && zone === 'into' && d.id !== id) return { ...o, bad: true };
    return null;
  }
  const same = (a: Over | null, b: Over | null) =>
    a === b || (!!a && !!b && a.id === b.id && a.zone === b.zone && !!a.bad === !!b.bad);

  /** Let go (or Esc): move it, or send the card home. */
  function finish(home: boolean) {
    stop.current?.();
    stop.current = null;
    const { drag: d, over: o } = carry.current;
    const { flat: fl, p: props } = live.current;
    carry.current = { drag: null, over: null };
    setDrag(null);
    setOver(null);
    if (!d) return;
    if (!home && o?.bad) showToast('Folders go three levels deep.');
    const ok = !home && !!o && !o.bad && canDrop(fl.fs, fl.ns, d, o);
    if (!ok || !o) {
      setGhost((g) => (g ? { ...g, to: { kind: d.kind, id: d.id } } : g));
      return;
    }
    const at = place(d, o);
    if (d.kind === 'note') props.onMoveNote?.(d.id, at.parent, at.index);
    else props.onMoveFolder?.(d.id, at.parent, at.index);
    const into = o.zone === 'into' && !!o.id;
    if (into) open(o.id!);
    // Into a folder: the card glides onto the folder and sinks in. Anywhere else it glides to the row's new place.
    setGhost((g) =>
      g ? { ...g, to: into ? { kind: 'folder', id: o.id!, sink: true } : { kind: d.kind, id: d.id } } : g,
    );
    setLanded(into ? o.id : d.id);
    if (lt.current) clearTimeout(lt.current);
    lt.current = setTimeout(() => setLanded(null), LANDED_MS + GLIDE_MS);
  }

  // Once the list has redrawn, the card flies to its row, then goes.
  useLayoutEffect(() => {
    if (!ghost?.to || ghost.placed) return;
    const el = nav.current?.querySelector(
      `[data-nb-kind="${ghost.to.kind}"][data-nb-id="${CSS.escape(ghost.to.id)}"]:not(.tp-nb-fempty)`,
    );
    const b = el ? boxOf(el) : null;
    setGhost({ ...ghost, placed: true, ...(b ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the card gets somewhere to go
  }, [ghost]);
  const placed = !!ghost?.placed;
  useEffect(() => {
    if (!placed) return;
    const t = setTimeout(() => setGhost(null), reducedMotion() ? 0 : GLIDE_MS + 10);
    return () => clearTimeout(t);
  }, [placed]);

  const down: Common['down'] = (e, kind, id, label) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest?.('.tp-nb-fadd, .tp-nb-menuw, input')) return;
    if (!nav.current || carry.current.drag) return;
    stop.current?.();
    const row = e.currentTarget as HTMLElement;
    const touch = e.pointerType !== 'mouse';
    const x0 = e.clientX;
    const y0 = e.clientY;
    const b = boxOf(row);
    const p0 = local(x0, y0);
    const off = { x: p0.x - b.x, y: p0.y - b.y };
    let lifted = false;
    let px = x0;
    let py = y0;
    let hold: ReturnType<typeof setTimeout> | null = null;
    let spring: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;

    const aimHere = () => {
      const o = aim(px, py);
      if (same(o, carry.current.over)) return;
      carry.current = { ...carry.current, over: o };
      setOver(o);
      if (spring) clearTimeout(spring);
      spring = null;
      if (o && o.kind === 'folder' && o.zone === 'into' && !o.bad && o.id && !live.current.openIds[o.id]) {
        const fid = o.id;
        spring = setTimeout(() => open(fid), SPRING_MS);
      }
    };
    const tick = () => {
      raf = requestAnimationFrame(() => {
        const sc = scroller.current;
        if (!sc || !lifted) return;
        const r = sc.getBoundingClientRect();
        let v = 0;
        if (py < r.top + EDGE_PX) v = -Math.ceil((r.top + EDGE_PX - py) / 3);
        else if (py > r.bottom - EDGE_PX) v = Math.ceil((py - (r.bottom - EDGE_PX)) / 3);
        if (v) {
          sc.scrollTop += v;
          aimHere();
        }
        tick();
      });
    };
    const lift = () => {
      lifted = true;
      row.classList.remove('tp-nb-pressing');
      const d = { kind, id };
      carry.current = { drag: d, over: null };
      setDrag(d);
      const at = local(px, py);
      setGhost({ kind, label, w: b.w, x: at.x - off.x, y: at.y - off.y, touch });
      tick();
    };
    const move = (ev: PointerEvent) => {
      px = ev.clientX;
      py = ev.clientY;
      const dist = Math.abs(px - x0) + Math.abs(py - y0);
      if (!lifted) {
        if (!touch && dist > LIFT_PX) lift();
        else if (touch && dist > HOLD_SLOP) end();
        return;
      }
      ev.preventDefault();
      const at = local(px, py);
      setGhost((g) => (g ? { ...g, x: at.x - off.x, y: at.y - off.y } : g));
      aimHere();
    };
    // A drag isn't a click: the click that follows it is swallowed.
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      document.removeEventListener('click', swallow, true);
    };
    const up = () => {
      if (!lifted) return end();
      document.addEventListener('click', swallow, true);
      setTimeout(() => document.removeEventListener('click', swallow, true), 60);
      finish(false);
    };
    const cancel = () => (lifted ? finish(true) : end());
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && lifted) {
        ev.preventDefault();
        ev.stopPropagation();
        finish(true);
      }
    };
    // While a finger carries a row, the page doesn't scroll under it.
    const still = (ev: TouchEvent) => {
      if (lifted) ev.preventDefault();
    };
    function end() {
      stop.current?.();
      stop.current = null;
    }
    stop.current = () => {
      if (hold) clearTimeout(hold);
      if (spring) clearTimeout(spring);
      cancelAnimationFrame(raf);
      row.classList.remove('tp-nb-pressing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('touchmove', still);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', key, true);
    document.addEventListener('touchmove', still, { passive: false });
    if (touch) {
      row.classList.add('tp-nb-pressing');
      hold = setTimeout(lift, HOLD_MS);
    }
  };

  const folders = ql ? prune(p.folders, ql) : p.folders;
  const loose = p.notes.filter((n) => matches(n, ql));
  const none = !!ql && !folders.length && !loose.length;
  const c: Common = {
    openIds,
    filtering: !!ql,
    toggle,
    open,
    active: p.active,
    p,
    drag,
    over,
    landed,
    adding,
    setAdding,
    down,
    flying: ghost?.to && !ghost.to.sink ? ghost.to.id : null,
  };
  const startFolder = () => {
    setNewOpen(false);
    setAdding(null);
  };

  let body;
  if (p.loading)
    body = (
      <div className="tp-nb-tree-load" aria-label="Loading your notes" aria-busy="true">
        {[150, 120, 170, 96, 140, 110].map((w, i) => (
          <div key={i} className="tp-nb-skrow" style={{ paddingLeft: i === 2 || i === 3 ? 34 : 10 }}>
            <Skeleton width={14} height={14} />
            <Skeleton width={w} height={11} />
          </div>
        ))}
      </div>
    );
  else if (p.error)
    body = (
      <div className="tp-nb-tree-msg" role="alert">
        <p>Your notes didn’t load.</p>
        <Button variant="secondary" size="sm" onClick={p.onRetry}>
          Try again
        </Button>
      </div>
    );
  else if (!p.folders.length && !p.notes.length && adding === undefined)
    body = (
      <div className="tp-nb-tree-msg">
        <p>No notes yet. Folders you make show up here.</p>
      </div>
    );
  else
    body = (
      <div
        className={cx('tp-nb-tree-list', drag && 'tp-nb-dragon')}
        role="tree"
        aria-label="Notes and folders"
      >
        {folders.map((f) => (
          <Folder key={f.id} folder={f} depth={0} c={c} />
        ))}
        {adding === null ? (
          <NameField
            initial=""
            depth={0}
            onDone={(name) => {
              if (name === null) {
                setAdding(undefined);
                return null;
              }
              const bad = p.onCreateFolder?.(null, name);
              if (!bad) setAdding(undefined);
              return bad;
            }}
          />
        ) : null}
        <div className={cx('tp-nb-root', over?.kind === 'root' && 'tp-nb-drop-root')} data-nb-kind="root">
          {/* Notes in no folder sit at the top of the Notebook: after the folders, below a hairline. */}
          {(loose.length || drag) && folders.length ? (
            <div className="tp-nb-loose-sep" aria-hidden="true" />
          ) : null}
          {loose.map((n) => (
            <TreeNote key={n.id} note={n} depth={0} c={c} />
          ))}
          {drag && !loose.length ? (
            <p className="tp-nb-root-hint">Drop here to take it out of its folder</p>
          ) : null}
        </div>
        {none ? (
          <p className="tp-nb-none">
            No note matches “<b>{q.trim()}</b>”.
          </p>
        ) : null}
      </div>
    );

  const find = (
    <div className="tp-nb-tree-ff">
      <FilterField placeholder="Find a note" value={q} onChange={setQ} />
    </div>
  );
  const card = ghost ? (
    <div
      className={cx(
        'tp-nb-ghost',
        ghost.placed && 'tp-nb-ghost-placed',
        ghost.to?.sink && 'tp-nb-ghost-sink',
        ghost.touch && 'tp-nb-ghost-touch',
      )}
      aria-hidden="true"
      style={{ left: ghost.x, top: ghost.y, width: ghost.w }}
    >
      <span className="tp-nb-row-ic">
        <NoteIcon name={ghost.kind === 'folder' ? 'folder' : 'note'} size={14} />
      </span>
      <span className="tp-nb-ghost-t">{ghost.label}</span>
    </div>
  ) : null;
  if (p.bare)
    return (
      <nav
        ref={nav}
        className={cx('tp-root tp-nb-tree tp-nb-tree-bare', drag && 'tp-nb-carrying', p.className)}
        aria-label="Notebook"
      >
        {find}
        <div ref={scroller} className="tp-nb-tree-scroll">
          {body}
        </div>
        {card}
      </nav>
    );
  return (
    <nav
      ref={nav}
      className={cx('tp-root tp-nb-tree', drag && 'tp-nb-carrying', p.className)}
      aria-label="Notebook"
    >
      <div className="tp-nb-tree-h">
        <h2>Notebook</h2>
        {/* One quiet New button: a note (the usual thing, first) or a folder. */}
        <span ref={newRef} className="tp-nb-menuw">
          <IconButton
            label="New note or folder"
            tipSide="bottom-end"
            className={newOpen ? 'tp-on' : undefined}
            onClick={() => setNewOpen(!newOpen)}
          >
            <Icon name="plus" size={17} />
          </IconButton>
          <NotePop open={newOpen} className="tp-nb-pop-r tp-nb-newmenu">
            <MenuList
              label="New"
              items={[
                {
                  label: 'New note',
                  onSelect: () => {
                    setNewOpen(false);
                    p.onNewNote?.(null);
                  },
                },
                p.onCreateFolder && { label: 'New folder', onSelect: startFolder },
              ]}
            />
          </NotePop>
        </span>
      </div>
      {find}
      <div ref={scroller} className="tp-nb-tree-scroll">
        {body}
      </div>
      {card}
      <div className="tp-nb-tree-f">
        <button
          type="button"
          className={cx('tp-nb-trash', p.active === 'trash' && 'tp-on')}
          onClick={p.onTrash}
        >
          <Icon name="trash" size={14} />
          <span>Trash</span>
          {p.trashCount ? <span className="tp-nb-fcount">{p.trashCount}</span> : null}
        </button>
      </div>
    </nav>
  );
}
