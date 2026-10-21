import {
  addDays,
  dueDistance,
  formatDay,
  relativeDayLabel,
  type IsoDate,
  type TaskVisibility,
} from '@tudu/core';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cx } from '../lib/cx';
import { useOutside } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Linger } from '../lib/linger';
import { Avatar } from './Avatar';
import { Checkbox } from './Checkbox';
import { IconButton } from './IconButton';
import { Menu, MenuList } from './Menu';
import { MiniCalendar, type MiniCalendarProps } from './MiniCalendar';
import { ProjectMenu, type ProjectOption } from './ProjectMenu';
import { RichTextContent, RichTextEditor, toHtml } from './RichTextEditor';
import { Skeleton } from './Skeleton';
import { SubtaskList, type SubtaskItem } from './SubtaskList';
import type { TaskCarried } from './TaskRow';
import { showToast } from './Toast';

export interface DetailComment {
  key: string;
  who: string;
  initials: string;
  color?: string;
  /** "Thu 10:12", "Just now". */
  when: string;
  html: string;
  /** Yours: Edit and Delete under its ⋯. */
  mine: boolean;
  edited?: boolean;
}

export interface DetailEvent {
  key: string | number;
  text: string;
  when: string;
}

export interface TaskDetailTask {
  /** Stable identity: the task's own id. */
  key: string;
  /** The task ID people see, "ME-52"; missing until the server numbers it. */
  id?: string | null;
  title: string;
  done: boolean;
  /** The day it is planned for; null is the Backlog. */
  day: IsoDate | null;
  carried?: TaskCarried;
  due: IsoDate | null;
  visibility: TaskVisibility;
  /** The project it belongs to, if any. */
  projectId?: string | null;
  notes: string;
  subtasks: SubtaskItem[];
  comments: DetailComment[];
  history: DetailEvent[];
}

export interface VisibilityOption {
  value: TaskVisibility;
  label: string;
  hint?: string;
}

export interface TaskDetailProps {
  task: TaskDetailTask;
  today: IsoDate;
  me: { initials: string; name: string; color?: string };
  /** "Only you", and the space once there is one. */
  visibility: VisibilityOption[];
  /** The month's dots for the Planned picker. */
  calendar?: Pick<MiniCalendarProps, 'marks' | 'month'>;
  /** The space's projects for the Project fact. Without the list the fact stays out. */
  projects?: ProjectOption[];
  /** Where attachment chips link: the API's origin. */
  fileBase?: string;
  /** Which way the content slides in when stepping to another task. */
  turnDir?: 'next' | 'prev';
  /** Phones: the back button's words, "Today" or the day's name. */
  backLabel?: string;
  compact?: boolean;
  /** What "Copy link to task" copies. */
  link?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose?: () => void;
  onRename?: (title: string) => void;
  onCross?: (done: boolean) => void;
  onMove?: (day: IsoDate | null) => void;
  onDue?: (day: IsoDate | null) => void;
  onVisibility?: (v: TaskVisibility) => void;
  onProject?: (projectId: string | null) => void;
  /** "New project…": make one with this name and return its id. */
  onNewProject?: (name: string) => string | void;
  onNotes?: (html: string) => void;
  /** "Attach a file" in the notes and comment editors. */
  onAttach?: (
    file: File,
    onProgress?: (ratio: number) => void,
  ) => Promise<{ id: string; name: string; size: number }>;
  onAddSubtask?: (title: string) => void;
  onRenameSubtask?: (sub: SubtaskItem, title: string) => void;
  onToggleSubtask?: (sub: SubtaskItem, done: boolean) => void;
  onReorderSubtask?: (sub: SubtaskItem, from: number, to: number) => void;
  onDeleteSubtask?: (sub: SubtaskItem, index: number) => void;
  onRestoreSubtask?: (sub: SubtaskItem, index: number) => void;
  /** Returns the new comment's key, so it can get the wash. */
  onAddComment?: (html: string) => string | void;
  onEditComment?: (c: DetailComment, html: string) => void;
  onDeleteComment?: (c: DetailComment) => void;
  onRestoreComment?: (c: DetailComment) => void;
  onDelete?: () => void;
  className?: string;
}

/** How long a new comment keeps its wash. */
export const COMMENT_FRESH_MS = 1800;
const COMMENTS_KEPT = 3;

const FACT_ICONS = {
  project: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx={12} cy={10} r={3} />
    </>
  ),
  day: (
    <>
      <rect x={3} y={4} width={18} height={18} rx={2} />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  due: (
    <>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" />
    </>
  ),
  vis: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx={12} cy={12} r={3} />
    </>
  ),
};

function FactIcon({ name }: { name: keyof typeof FACT_ICONS }) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {FACT_ICONS[name]}
    </svg>
  );
}

interface FactProps {
  icon: keyof typeof FACT_ICONS;
  label: string;
  empty?: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  pop: ReactNode;
  children: ReactNode;
}

/** One fact: a label on the left, a quiet button on the right that opens its picker right under it. */
function Fact({ icon, label, empty, open, onOpen, pop, children }: FactProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  useOutside(open, box, () => onOpen(false));
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    onOpen(false);
    btn.current?.focus({ preventScroll: true });
  }
  return (
    <div className="tp-td-prop" ref={box} onKeyDown={onKey}>
      <dt>
        <FactIcon name={icon} />
        <span>{label}</span>
      </dt>
      <dd>
        <button
          ref={btn}
          type="button"
          className={cx('tp-td-val', empty && 'tp-td-empty')}
          aria-label={label}
          aria-expanded={open ? 'true' : 'false'}
          aria-haspopup="dialog"
          onClick={() => onOpen(!open)}
        >
          {children}
        </button>
        <Linger open={open} className="tp-td-pop">
          {pop}
        </Linger>
      </dd>
    </div>
  );
}

function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

/** "Today · Sun 18 Oct", "Backlog". */
function dayLabel(day: IsoDate | null, today: IsoDate): string {
  if (!day) return 'Backlog';
  const rel = relativeDayLabel(day, today);
  const near = rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday';
  return near ? `${rel} · ${formatDay(day)}` : formatDay(day);
}

/**
 * Everything about one task, in a calm column: the ID and the arrows at the top, the checkbox and the title
 * written in place, then the facts (Planned, Due, Visible to), Notes, Subtasks, History (folded) and Comments,
 * with the comment box pinned to the foot. Every fact opens its picker in place; nothing else competes. Delete
 * lives under ⋯. Written in place, no Save button.
 */
export function TaskDetail(p: TaskDetailProps) {
  const { task: t, today, compact = false } = p;
  const key = t.key;
  const [title, setTitle] = useState(t.title);
  const [pop, setPop] = useState<null | 'day' | 'due' | 'vis' | 'project'>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [allCm, setAllCm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [turn, setTurn] = useState(p.turnDir ?? 'next');
  const freshEl = useRef<HTMLLIElement | null>(null);
  const scrollEl = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelTitle = useRef(false);

  // Another task: every field, picker and fold starts fresh; the content slides in from the side we are heading to.
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    setTitle(t.title);
    setPop(null);
    setHistOpen(false);
    setAllCm(false);
    setEditing(null);
    setFresh(null);
    setTurn(p.turnDir ?? 'next');
  }
  // The title from the server wins when nobody is writing it here.
  const [writingTitle, setWritingTitle] = useState(false);
  const [seenTitle, setSeenTitle] = useState(t.title);
  if (t.title !== seenTitle) {
    setSeenTitle(t.title);
    if (!writingTitle) setTitle(t.title);
  }
  useAutosize(titleRef, title + key);

  // Notes save when you leave the field, and before the panel moves on with words still unsaved.
  const notes = useRef<{ html: string; dirty: boolean }>({ html: toHtml(t.notes), dirty: false });
  const cb = useRef(p);
  useLayoutEffect(() => {
    cb.current = p;
  });
  useEffect(() => {
    notes.current = { html: toHtml(cb.current.task.notes), dirty: false };
    return () => {
      if (notes.current.dirty) cb.current.onNotes?.(notes.current.html);
    };
  }, [key]);
  function saveNotes(html: string, isEmpty: boolean) {
    const v = isEmpty ? '' : html;
    notes.current = { html: v, dirty: false };
    if (v !== toHtml(t.notes)) p.onNotes?.(v);
  }

  // A new comment slides in with a soft wash, and the panel scrolls just enough to show it.
  useEffect(() => {
    if (!fresh) return;
    const el = freshEl.current;
    const sc = scrollEl.current;
    if (el && sc) {
      const r = el.getBoundingClientRect();
      const b = sc.getBoundingClientRect();
      if (r.bottom > b.bottom - 12 || r.top < b.top) {
        try {
          sc.scrollTo({ top: sc.scrollTop + (r.bottom - b.bottom) + 24, behavior: 'smooth' });
        } catch {
          sc.scrollTop += r.bottom - b.bottom + 24;
        }
      }
    }
    const tm = setTimeout(() => setFresh(null), COMMENT_FRESH_MS);
    return () => clearTimeout(tm);
  }, [fresh]);

  function copy(text: string, msg: string) {
    try {
      void navigator.clipboard?.writeText(text).catch(() => {});
    } catch {
      /* no clipboard here; the toast still confirms */
    }
    showToast(msg);
  }

  const tomorrow = addDays(today, 1);
  const due = t.due;
  const dueRel = due ? dueDistance(due, today) : null;
  const doneCount = t.subtasks.filter((s) => s.done).length;
  const visOpts = p.visibility.length ? p.visibility : [{ value: 'me' as const, label: 'Only you' }];
  const project = p.projects?.find((x) => x.id === t.projectId) ?? null;
  const vis = visOpts.find((o) => o.value === t.visibility) ?? visOpts[0]!;
  const cal = p.calendar ?? {};

  const top = (
    <header className="tp-td-top">
      {compact && p.onClose ? (
        <button type="button" className="tp-td-back" onClick={p.onClose}>
          <Icon name="left" size={18} />
          <span>{p.backLabel ?? 'Today'}</span>
        </button>
      ) : null}
      {t.id ? (
        <button
          type="button"
          className="tp-td-id"
          title="Copy task ID"
          aria-label={`Copy task ID ${t.id}`}
          onClick={() => copy(t.id!, `Copied ${t.id}`)}
        >
          {t.id}
        </button>
      ) : null}
      <span className="tp-td-sp" />
      {p.onPrev ? (
        <IconButton label="Previous task" tipSide="bottom" onClick={p.onPrev}>
          <Icon name="left" size={16} />
        </IconButton>
      ) : null}
      {p.onNext ? (
        <IconButton label="Next task" tipSide="bottom" onClick={p.onNext}>
          <Icon name="right" size={16} />
        </IconButton>
      ) : null}
      <div className="tp-td-more">
        <Menu
          label="More"
          items={[
            p.link ? { label: 'Copy link to task', onSelect: () => copy(p.link!, 'Link copied') } : null,
            t.id
              ? { label: 'Copy task ID', hint: t.id, onSelect: () => copy(t.id!, `Copied ${t.id}`) }
              : null,
            p.onDelete ? { label: 'Delete task', danger: true, onSelect: p.onDelete } : null,
          ]}
        >
          <IconButton label="More" tipSide="bottom">
            <Icon name="more" size={16} />
          </IconButton>
        </Menu>
      </div>
      {!compact && p.onClose ? (
        <IconButton label="Close" tipSide="bottom-end" className="tp-td-close" onClick={p.onClose}>
          <Icon name="x" size={16} />
        </IconButton>
      ) : null}
    </header>
  );

  const facts = (
    <dl className="tp-td-props">
      <Fact
        icon="day"
        label="Planned"
        open={pop === 'day'}
        onOpen={(v) => setPop(v ? 'day' : null)}
        pop={
          <MiniCalendar
            {...cal}
            today={today}
            selected={t.day}
            month={(t.day ?? today).slice(0, 7)}
            presets={[
              { label: 'Today', on: t.day === today, value: today },
              { label: 'Tomorrow', on: t.day === tomorrow, value: tomorrow },
            ]}
            onPreset={(v) => {
              setPop(null);
              if (v !== t.day) p.onMove?.(v);
            }}
            onPick={(k) => {
              setPop(null);
              if (k !== t.day) p.onMove?.(k);
            }}
            clearLabel={t.day ? 'Move to the Backlog' : undefined}
            onClear={
              t.day
                ? () => {
                    setPop(null);
                    p.onMove?.(null);
                  }
                : undefined
            }
            hint={(k) => ({
              text:
                k === t.day
                  ? `Keep it on ${k === today ? 'today' : formatDay(k)}`
                  : `Move to ${k === today ? 'today' : k === tomorrow ? 'tomorrow' : formatDay(k)}`,
              tone: k === today ? 'today' : '',
            })}
            hintEmpty="Pick a day for it"
          />
        }
      >
        <span>{dayLabel(t.day, today)}</span>
        {t.carried ? (
          <span className={cx('tp-td-note', t.carried.slipping && 'tp-od')}>
            carried from {t.carried.label}
          </span>
        ) : null}
      </Fact>
      <Fact
        icon="due"
        label="Due"
        empty={!due}
        open={pop === 'due'}
        onOpen={(v) => setPop(v ? 'due' : null)}
        pop={
          <MiniCalendar
            today={today}
            selected={due ?? undefined}
            month={(due ?? today).slice(0, 7)}
            marks={{}}
            clearLabel={due ? 'Remove due date' : undefined}
            onClear={
              due
                ? () => {
                    setPop(null);
                    p.onDue?.(null);
                  }
                : undefined
            }
            onPick={(k) => {
              setPop(null);
              if (k !== due) p.onDue?.(k);
            }}
            hint={(k) => {
              const r = dueDistance(k, today);
              return { text: `${formatDay(k)} · ${r.tone === 'today' ? 'due today' : r.text}`, tone: r.tone };
            }}
            hintEmpty="Pick a due date"
          />
        }
      >
        {due ? (
          <>
            <span className={dueRel?.tone === 'overdue' ? 'tp-td-od' : undefined}>{formatDay(due)}</span>
            <span
              className={cx(
                'tp-td-note',
                dueRel?.tone === 'overdue' && 'tp-od',
                dueRel?.tone === 'today' && 'tp-td-now',
              )}
            >
              {dueRel?.text}
            </span>
          </>
        ) : (
          <span>Add a due date</span>
        )}
      </Fact>
      {p.projects ? (
        <Fact
          icon="project"
          label="Project"
          empty={!project}
          open={pop === 'project'}
          onOpen={(v) => setPop(v ? 'project' : null)}
          pop={
            <ProjectMenu
              projects={p.projects}
              selected={t.projectId ?? null}
              onPick={(id) => {
                setPop(null);
                if (id !== (t.projectId ?? null)) p.onProject?.(id);
              }}
              onNew={
                p.onNewProject
                  ? (name) => {
                      const id = p.onNewProject!(name);
                      setPop(null);
                      if (id) p.onProject?.(id);
                    }
                  : undefined
              }
            />
          }
        >
          {project ? (
            <>
              <i className="tp-dot" style={{ background: project.color }} />
              <span>{project.name}</span>
            </>
          ) : (
            <span>Add to a project</span>
          )}
        </Fact>
      ) : null}
      <Fact
        icon="vis"
        label="Visible to"
        open={pop === 'vis'}
        onOpen={(v) => setPop(v ? 'vis' : null)}
        pop={
          <MenuList
            label="Who can see this task"
            heading="Who can see this task"
            items={visOpts.map((o) => ({
              label: o.label,
              hint: o.value === vis.value ? '✓' : (o.hint ?? ''),
              onSelect: () => {
                setPop(null);
                if (o.value !== t.visibility) p.onVisibility?.(o.value);
              },
            }))}
          />
        }
      >
        <span>{vis.label}</span>
      </Fact>
    </dl>
  );

  const notesSec = (
    <section className="tp-td-sec">
      <h3 className="tp-td-h">Notes</h3>
      <RichTextEditor
        variant="notes"
        label="Notes"
        resetKey={key}
        value={t.notes}
        compact={compact}
        placeholder="Add notes, links, anything that helps…"
        onAttach={p.onAttach}
        fileBase={p.fileBase}
        onInput={(html, isEmpty) => {
          notes.current = { html: isEmpty ? '' : html, dirty: true };
        }}
        onBlur={saveNotes}
      />
    </section>
  );

  const subsSec = (
    <section className="tp-td-sec">
      <h3 className="tp-td-h">
        Subtasks
        {t.subtasks.length ? (
          <span>
            {doneCount} of {t.subtasks.length}
          </span>
        ) : null}
      </h3>
      <SubtaskList
        variant="panel"
        subtasks={t.subtasks}
        parentTitle={t.title}
        compact={compact}
        onAdd={p.onAddSubtask}
        onRename={p.onRenameSubtask}
        onToggle={p.onToggleSubtask}
        onReorder={p.onReorderSubtask}
        onDelete={p.onDeleteSubtask}
        onRestore={p.onRestoreSubtask}
      />
    </section>
  );

  const events = t.history;
  const history = events.length ? (
    <section className="tp-td-sec tp-td-histsec">
      <button
        type="button"
        className={cx('tp-td-h tp-td-hbtn', histOpen && 'tp-open')}
        aria-expanded={histOpen ? 'true' : 'false'}
        onClick={() => setHistOpen(!histOpen)}
      >
        History
        <span>
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
        <svg
          className="tp-td-hchev"
          width={13}
          height={13}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <div className={cx('tp-td-hist', histOpen && 'tp-open')}>
        <div>
          <ol className="tp-td-act tp-td-evts" aria-hidden={histOpen ? undefined : 'true'}>
            {events.map((e) => (
              <li key={e.key} className="tp-td-evt">
                <i aria-hidden="true" />
                <span>{e.text}</span>
                <span className="tp-td-when">{e.when}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  ) : null;

  const cms = t.comments;
  const folded = !allCm && cms.length > 5;
  const shown = folded ? cms.slice(-COMMENTS_KEPT) : cms;
  const comments = (
    <section className="tp-td-sec tp-td-cmsec">
      <h3 className="tp-td-h">Comments{cms.length ? <span>{cms.length}</span> : null}</h3>
      {folded ? (
        <button type="button" className="tp-td-earlier" onClick={() => setAllCm(true)}>
          Show {cms.length - COMMENTS_KEPT} earlier comments
        </button>
      ) : null}
      {cms.length ? (
        <ol className="tp-td-act">
          {shown.map((c) => (
            <li
              key={c.key}
              ref={fresh === c.key ? freshEl : null}
              className={cx('tp-td-cmt', editing === c.key && 'tp-editing', fresh === c.key && 'tp-fresh')}
            >
              <Avatar initials={c.initials} name={c.who} size="sm" color={c.color} />
              <div className="tp-td-cmt-b">
                <div className="tp-td-who">
                  <b>{c.who}</b>
                  <span>
                    {c.when}
                    {c.edited ? ' · edited' : ''}
                  </span>
                  {c.mine && editing !== c.key ? (
                    <div className="tp-td-cmt-more">
                      <Menu
                        label="Comment options"
                        items={[
                          { label: 'Edit comment', onSelect: () => setEditing(c.key) },
                          {
                            label: 'Delete comment',
                            danger: true,
                            onSelect: () => {
                              p.onDeleteComment?.(c);
                              showToast('Comment deleted', {
                                action: 'Undo',
                                onAction: () => p.onRestoreComment?.(c),
                              });
                            },
                          },
                        ]}
                      >
                        <button type="button" className="tp-td-cmt-btn" aria-label="Comment options">
                          <Icon name="more" size={15} />
                        </button>
                      </Menu>
                    </div>
                  ) : null}
                </div>
                {editing === c.key ? (
                  <RichTextEditor
                    variant="comment"
                    label="Edit comment"
                    resetKey={`${key}:e${c.key}`}
                    value={c.html}
                    autoFocus
                    submitLabel="Save"
                    compact={compact}
                    alwaysOpen
                    onAttach={p.onAttach}
                    fileBase={p.fileBase}
                    onSubmit={(html) => {
                      setEditing(null);
                      p.onEditComment?.(c, html);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <RichTextContent html={c.html} className="tp-td-cmt-text" fileBase={p.fileBase} />
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="tp-td-nocm">No comments yet.</p>
      )}
    </section>
  );

  return (
    <div className={cx('tp-root tp-td', compact && 'tp-compact', t.done && 'tp-done', p.className)}>
      {top}
      <div className="tp-td-scroll" ref={scrollEl}>
        <div key={key} className={cx('tp-td-body', `tp-td-in-${turn}`)}>
          <div className="tp-td-head">
            <Checkbox
              label={t.done ? `Not done: ${title}` : `Cross off: ${title}`}
              checked={t.done}
              onChange={(v) => p.onCross?.(v)}
            />
            <textarea
              ref={titleRef}
              rows={1}
              className="tp-td-title"
              value={title}
              aria-label="Task title"
              spellCheck
              onFocus={() => setWritingTitle(true)}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  cancelTitle.current = true;
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => {
                setWritingTitle(false);
                const v = title.trim();
                if (cancelTitle.current || !v) {
                  cancelTitle.current = false;
                  setTitle(t.title);
                  return;
                }
                if (v !== t.title) p.onRename?.(v);
                else setTitle(t.title);
              }}
            />
          </div>
          {facts}
          {notesSec}
          {subsSec}
          {history}
          {comments}
        </div>
      </div>
      <footer className="tp-td-compose">
        <Avatar initials={p.me.initials} name={p.me.name} size="sm" color={p.me.color} />
        <RichTextEditor
          variant="comment"
          label="Write a comment"
          resetKey={`${key}:new`}
          placeholder="Write a comment…"
          compact={compact}
          onAttach={p.onAttach}
          fileBase={p.fileBase}
          onSubmit={(html) => {
            const k = p.onAddComment?.(html);
            if (k) setFresh(k);
          }}
        />
      </footer>
    </div>
  );
}

/** The panel while its task loads: a shimmer column in the shape of the detail. */
export function TaskDetailSkeleton({
  compact,
  onClose,
  backLabel,
}: {
  compact?: boolean;
  onClose?: () => void;
  backLabel?: string;
}) {
  return (
    <div className={cx('tp-root tp-td', compact && 'tp-compact')} aria-busy="true" aria-label="Loading task">
      <header className="tp-td-top">
        {compact && onClose ? (
          <button type="button" className="tp-td-back" onClick={onClose}>
            <Icon name="left" size={18} />
            <span>{backLabel ?? 'Today'}</span>
          </button>
        ) : null}
        <span className="tp-td-sp" />
        {!compact && onClose ? (
          <IconButton label="Close" tipSide="bottom-end" className="tp-td-close" onClick={onClose}>
            <Icon name="x" size={16} />
          </IconButton>
        ) : null}
      </header>
      <div className="tp-td-scroll">
        <div className="tp-td-body tp-td-skl">
          <Skeleton width="70%" height={22} />
          <Skeleton width="42%" />
          <Skeleton width="36%" />
          <Skeleton width="30%" />
          <Skeleton width="88%" />
          <Skeleton width="64%" />
        </div>
      </div>
    </div>
  );
}
