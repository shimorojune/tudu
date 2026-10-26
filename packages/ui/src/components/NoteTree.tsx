import { useEffect, useRef, useState, type DragEvent } from 'react';
import { canDrop, type DropTarget, type NotebookFolder, type NoteHeader } from '@tudu/core';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { FilterField } from './FilterField';
import { IconButton } from './IconButton';
import { MenuList } from './Menu';
import { NoteIcon, NotePop, NoteRow, noteLabel, useCloseOnOutside, type NoteItem } from './NoteParts';
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
  dnd: {
    start: (e: DragEvent, kind: Drag['kind'], id: string) => void;
    end: () => void;
    overRow: (e: DragEvent, kind: 'folder' | 'note', id: string) => void;
    leave: (e: DragEvent, id: string) => void;
    drop: (e: DragEvent) => void;
  };
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
          )}
          style={{ '--nb-depth': depth } as React.CSSProperties}
          role="treeitem"
          aria-expanded={open}
          aria-level={depth + 1}
          draggable={!c.filtering}
          onDragStart={(e) => c.dnd.start(e, 'folder', f.id)}
          onDragEnd={c.dnd.end}
          onDragOver={(e) => c.dnd.overRow(e, 'folder', f.id)}
          onDragLeave={(e) => c.dnd.leave(e, f.id)}
          onDrop={c.dnd.drop}
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
            <p className="tp-nb-fempty" style={{ '--nb-depth': depth + 1 } as React.CSSProperties}>
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
      )}
      style={{ '--nb-depth': depth } as React.CSSProperties}
      role="treeitem"
      aria-level={depth + 1}
      draggable={!c.filtering}
      onDragStart={(e) => c.dnd.start(e, 'note', note.id)}
      onDragEnd={c.dnd.end}
      onDragOver={(e) => c.dnd.overRow(e, 'note', note.id)}
      onDragLeave={(e) => c.dnd.leave(e, note.id)}
      onDrop={c.dnd.drop}
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
 * The left side of the Notebook page: folders first (three levels at most), then notes in no folder, then Trash.
 * "Find a note" narrows it as you type, opening the folders that hold a match. Every row drags: a note onto a
 * folder goes into it, between notes it slots in; a folder goes into another or between folders, as long as
 * nothing ends up deeper than three levels.
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
  // undefined: not adding; null: a new folder at the top; an id: inside that folder.
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const lt = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (lt.current && clearTimeout(lt.current)), []);

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
    if (o.kind === 'root') return { parent: null };
    if (o.kind === 'folder' && o.zone === 'into') return { parent: o.id };
    if (o.kind === 'folder') {
      const parent = flat.fs.find((f) => f.id === o.id)?.parentId ?? null;
      const sibs = flat.fs.filter((f) => f.parentId === parent && f.id !== d.id);
      const i = sibs.findIndex((f) => f.id === o.id);
      return { parent, index: i + (o.zone === 'after' ? 1 : 0) };
    }
    const target = flat.ns.find((n) => n.id === o.id);
    const parent = target?.folderId ?? null;
    const sibs = flat.ns.filter((n) => n.folderId === parent && n.id !== d.id);
    const i = sibs.findIndex((n) => n.id === o.id);
    return { parent, index: i + (o.zone === 'after' ? 1 : 0) };
  }

  const dnd: Common['dnd'] = {
    start: (e, kind, id) => {
      e.stopPropagation();
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      } catch {
        /* some browsers keep the data to themselves */
      }
      setDrag({ kind, id });
    },
    end: () => {
      setDrag(null);
      setOver(null);
    },
    overRow: (e, kind, id) => {
      if (!drag) return;
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const y = r.height ? (e.clientY - r.top) / r.height : 0.5;
      let zone: Over['zone'];
      if (kind === 'folder')
        zone = drag.kind === 'note' ? 'into' : y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
      else {
        if (drag.kind === 'folder') {
          setOver(null);
          return;
        }
        zone = y < 0.5 ? 'before' : 'after';
      }
      let o: Over | null = { kind, id, zone };
      const ok = canDrop(flat.fs, flat.ns, drag, o);
      if (ok) {
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          /* fine */
        }
      } else if (kind === 'folder' && zone === 'into' && drag.id !== id) {
        // Too deep: the folder says so and takes nothing.
        e.preventDefault();
        o = { ...o, bad: true };
      } else o = null;
      if (!over || !o || over.id !== o.id || over.zone !== o.zone || !!over.bad !== !!o.bad) setOver(o);
    },
    leave: (e, id) => {
      if (over && over.id === id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    drop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (drag && over) {
        if (over.bad) showToast('Folders go three levels deep.');
        else if (canDrop(flat.fs, flat.ns, drag, over)) {
          const at = place(drag, over);
          if (drag.kind === 'note') p.onMoveNote?.(drag.id, at.parent, at.index);
          else p.onMoveFolder?.(drag.id, at.parent, at.index);
          if (over.zone === 'into' && over.id) open(over.id);
          setLanded(drag.id);
          if (lt.current) clearTimeout(lt.current);
          lt.current = setTimeout(() => setLanded(null), LANDED_MS);
        }
      }
      setDrag(null);
      setOver(null);
    },
  };
  const overRoot = (e: DragEvent) => {
    if (!drag) return;
    const o: Over = { kind: 'root', id: null, zone: 'root' };
    if (canDrop(flat.fs, flat.ns, drag, o)) {
      e.preventDefault();
      if (!over || over.kind !== 'root') setOver(o);
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
    dnd,
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
        <div
          className={cx('tp-nb-root', over?.kind === 'root' && 'tp-nb-drop-root')}
          onDragOver={overRoot}
          onDragLeave={(e) => {
            if (over?.kind === 'root' && !e.currentTarget.contains(e.relatedTarget as Node | null))
              setOver(null);
          }}
          onDrop={dnd.drop}
        >
          {loose.length || drag ? <div className="tp-nb-loose-h">Not in a folder</div> : null}
          {loose.map((n) => (
            <TreeNote key={n.id} note={n} depth={0} c={c} />
          ))}
          {drag && !loose.length ? (
            <p className="tp-nb-fempty">Drop here to take it out of its folder</p>
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
  if (p.bare)
    return (
      <nav className={cx('tp-root tp-nb-tree tp-nb-tree-bare', p.className)} aria-label="Notebook">
        {find}
        <div className="tp-nb-tree-scroll">{body}</div>
      </nav>
    );
  return (
    <nav className={cx('tp-root tp-nb-tree', p.className)} aria-label="Notebook">
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
      <div className="tp-nb-tree-scroll">{body}</div>
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
