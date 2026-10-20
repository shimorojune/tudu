import { dayWord, isoToday, type IsoDate } from '@tudu/core';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { closeRow, openRow, scrollerOf, settleFrom } from '../lib/motion';
import { itemByKey, moveItem, useDropGroup, useReorder } from '../lib/reorder';
import { AddTask } from './AddTask';
import type { MiniCalendarProps } from './MiniCalendar';
import { TaskRow, type TaskCarried, type TaskDue, type TaskProject, type TaskSignal } from './TaskRow';
import { showToast } from './Toast';

export interface TaskItem {
  /** Stable identity: the task's own id. */
  key: string;
  /** The task ID people see, "ME-41". */
  id?: string | null;
  title: string;
  done?: boolean;
  due?: TaskDue;
  carried?: TaskCarried;
  comments?: number;
  jira?: string;
  project?: TaskProject;
}

export interface TaskMove {
  key: string;
  from: number;
  to: number;
}

export interface TaskListProps {
  tasks: TaskItem[];
  /** Names the list for screen readers. */
  label?: string;
  compact?: boolean;
  brief?: boolean;
  /** After a drag or a keyboard move: the new order, and which row moved from where to where. */
  onReorder?: (tasks: TaskItem[], moved: TaskMove) => void;
  onToggleTask?: (task: TaskItem, done: boolean) => void;
  /** Click anywhere on a row to open it. */
  onOpenTask?: (task: TaskItem) => void;
  onSignal?: (task: TaskItem, kind: TaskSignal) => void;
  /**
   * Write a new task: at the end, or slotted in above `before` (the "+" between rows). Return the new row's key so
   * it opens its gap with the new-task wash.
   */
  onAdd?: (text: string, before?: string) => string | void;
  /** Ends the list with the writing line: "Write the next thing…". */
  addLabel?: string;
  /** Change it to open the writing line; a list that mounts with one starts with the line open. */
  addKey?: string | number | null;
  /** The writing line closed (Esc, or clicking away). */
  onAddClose?: () => void;
  /** Change it when the list shows a different day, so the rows start fresh. */
  resetKey?: string | number;
  /** A project name: only its tasks show, and the "+" and dragging between lists turn off. */
  filter?: string;
  /** A task added from outside the list (Quick Add): it opens its gap and gets the wash. */
  flashKey?: string;
  /** Show a task already here: scroll it to the middle, focus it, flash it. Add ":anything" to show it again. */
  locateKey?: string;
  /** The open task's row keeps the selection wash. */
  selectedKey?: string;
  /** The "+" between rows on desktop. On by default. */
  insertable?: boolean;
  /** Lists with the same group trade rows by drag (the two days side by side). */
  group?: string;
  /** A row dragged in from another list of the group, and where it landed. */
  onReceive?: (key: string, at: number) => void;
  /** The day header's calendar; `selected` is the list's day. With it the date pills open a picker. */
  calendar?: MiniCalendarProps;
  /** The Backlog: the list's own day is none. */
  undated?: boolean;
  /** Moved from the row's date pill (and back again by Undo, with the index it had). */
  onMoveTask?: (task: TaskItem, to: IsoDate | null, from: IsoDate | null, at?: number) => void;
  /** The carried pill's picker kept it on this day: the marker goes. */
  onKeepTask?: (task: TaskItem) => void;
  onDueChange?: (task: TaskItem, day: IsoDate | null) => void;
  planButton?: boolean;
  /** The row whose title is being written in place. */
  editingKey?: string | null;
  onRename?: (task: TaskItem, title: string) => void;
  onEditEnd?: () => void;
}

/** How long a new or dropped row keeps its wash. */
export const FRESH_MS = 1400;

/**
 * A list of TaskRows people reorder by dragging (or Alt with the arrow keys). One plain list: the order is the order
 * you drag them into. A new task opens its gap and settles in with a soft wash; the "+" between two rows writes a
 * task in that spot; lists in a group trade rows. The list is controlled: it shows `tasks` and reports changes.
 */
export function TaskList(p: TaskListProps) {
  const { tasks, compact, filter } = p;
  const ref = useRef<HTMLDivElement | null>(null);
  const [fresh, setFresh] = useState<{ key: string; follow?: 'add' | 'out' } | null>(null);
  const [insKey, setIns] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const opened = useRef<string | null>(null);
  const stopOpen = useRef<(() => void) | null>(null);
  const keyFlip = useRef<{ key: string; top: number; focus?: HTMLElement } | null>(null);

  // A new day starts fresh; a task added from outside opens its gap.
  const [seenReset, setSeenReset] = useState(p.resetKey);
  const [seenFlash, setSeenFlash] = useState(p.flashKey);
  if (p.resetKey !== seenReset) {
    setSeenReset(p.resetKey);
    setFresh(null);
    setIns(null);
  }
  if (p.flashKey !== seenFlash) {
    setSeenFlash(p.flashKey);
    if (p.flashKey) setFresh({ key: p.flashKey, follow: 'out' });
  }

  const shown = filter ? tasks.filter((t) => t.project?.name === filter) : tasks;

  // A fresh row opens its gap in the same frame it first appears, so it never shows at full size first.
  useLayoutEffect(() => {
    if (!fresh || opened.current === fresh.key || !ref.current) return;
    const el = itemByKey(ref.current, fresh.key);
    if (!el) return;
    opened.current = fresh.key;
    stopOpen.current?.();
    stopOpen.current = openRow(el, fresh.follow ?? null);
  }, [fresh, tasks]);
  useEffect(() => {
    if (!fresh) return;
    const k = fresh.key;
    const t = setTimeout(() => {
      setFresh((c) => (c?.key === k ? null : c));
      if (opened.current === k) opened.current = null;
    }, FRESH_MS);
    return () => clearTimeout(t);
  }, [fresh]);
  useEffect(() => () => stopOpen.current?.(), []);

  // A keyboard move glides the row into its new slot.
  useLayoutEffect(() => {
    const f = keyFlip.current;
    if (!f || !ref.current) return;
    keyFlip.current = null;
    const el = itemByKey(ref.current, f.key);
    if (el) settleFrom(el, f.top);
    if (f.focus?.isConnected && document.activeElement !== f.focus) f.focus.focus({ preventScroll: true });
  });

  // locateKey: scroll a task into the middle, focus it, flash it.
  const seenLocate = useRef<string | null>(null);
  useEffect(() => {
    const lk = p.locateKey;
    if (!lk || lk === seenLocate.current || !ref.current) return;
    const key = lk.split(':')[0]!;
    if (!tasks.some((t) => t.key === key || t.id === key)) return;
    seenLocate.current = lk;
    const hit = tasks.find((t) => t.key === key || t.id === key)!;
    const timer = setTimeout(() => {
      const el = ref.current ? itemByKey(ref.current, hit.key) : null;
      if (!el) return;
      const sc = scrollerOf(el);
      if (sc) {
        const sr = sc.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const top = sc.scrollTop + (r.top - sr.top) - Math.max(0, (sr.height - r.height) / 2);
        try {
          sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        } catch {
          sc.scrollTop = top;
        }
      }
      el.classList.remove('tp-locate');
      void el.offsetWidth;
      el.classList.add('tp-locate');
      setTimeout(() => el.classList.remove('tp-locate'), 2000);
      const f =
        el.querySelector<HTMLElement>('.tp-strike[tabindex]') ??
        el.querySelector<HTMLElement>('button.tp-cb');
      f?.focus({ preventScroll: true });
    }, 240);
    return () => clearTimeout(timer);
  }, [p.locateKey, tasks]);

  // Reordering inside this list (drag, or Alt with an arrow key) and rows handed over from another list.
  function reorder(from: number, to: number, key: string) {
    const nextShown = moveItem(shown, from, to);
    let next = nextShown;
    let toFull = to;
    if (filter) {
      // Slot it next to the same neighbour in the full list.
      const rest = tasks.filter((t) => t.key !== key);
      const after = nextShown[to + 1];
      const at = after ? rest.findIndex((t) => t.key === after.key) : rest.length;
      toFull = at;
      next = [...rest.slice(0, at), tasks.find((t) => t.key === key)!, ...rest.slice(at)];
    }
    const fromFull = tasks.findIndex((t) => t.key === key);
    p.onReorder?.(next, { key, from: fromFull, to: toFull });
  }
  const down = useReorder(ref, reorder, { group: filter ? null : p.group });
  useDropGroup(filter ? null : p.group, ref, (key, at) => {
    p.onReceive?.(key, at);
    setFresh({ key });
    opened.current = null;
  });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea')) return;
    const item = target.closest<HTMLElement>('[data-reorder]');
    if (!item || !ref.current?.contains(item)) return;
    const key = item.getAttribute('data-key')!;
    const from = shown.findIndex((t) => t.key === key);
    const to = Math.max(0, Math.min(shown.length - 1, from + (e.key === 'ArrowUp' ? -1 : 1)));
    e.preventDefault();
    if (from < 0 || to === from) return;
    keyFlip.current = { key, top: item.getBoundingClientRect().top, focus: target };
    reorder(from, to, key);
    setSaid(`Moved to place ${to + 1} of ${shown.length}`);
  }

  function add(text: string) {
    const key = p.onAdd?.(text);
    if (key) {
      opened.current = null;
      setFresh({ key, follow: 'add' });
    }
  }
  function insertBefore(before: string, text: string) {
    const key = p.onAdd?.(text, before);
    if (key) {
      opened.current = null;
      setFresh({ key });
    }
  }
  const canInsert = !compact && p.insertable !== false && !filter && !!p.onAdd;

  // Rescheduling from the row: keep it here (the marker goes), or move it (it folds away, with Undo).
  const cal = p.calendar;
  const calToday = cal ? (cal.today ?? isoToday()) : isoToday();
  const calDay: IsoDate | null = p.undated ? null : cal ? (cal.selected ?? calToday) : null;
  function planTask(t: TaskItem, v: IsoDate | null) {
    if (v === calDay) {
      p.onKeepTask?.(t);
      return;
    }
    const at = tasks.findIndex((x) => x.key === t.key);
    const el = ref.current ? itemByKey(ref.current, t.key) : null;
    closeRow(el, () => {
      p.onMoveTask?.(t, v, calDay);
      // If the page kept the row after all, put it back to its full size.
      requestAnimationFrame(() => {
        if (el?.isConnected) {
          el.style.height = '';
          el.style.opacity = '';
          el.style.overflow = '';
          el.style.pointerEvents = '';
        }
      });
      showToast(`Moved to ${dayWord(v, calToday)}`, {
        action: 'Undo',
        onAction: () => {
          p.onMoveTask?.(t, calDay, v, at);
          opened.current = null;
          setFresh({ key: t.key });
        },
      });
    });
  }

  return (
    <div className="tp-root">
      <div
        ref={ref}
        className="tp-list"
        onPointerDown={down}
        onKeyDown={onKeyDown}
        role="list"
        aria-label={p.label ?? 'Tasks'}
      >
        {shown.flatMap((t, i) => {
          const out = [];
          if (insKey === t.key)
            out.push(
              <div key={`ins-${t.key}`} className="tp-insrow" role="listitem">
                <AddTask
                  label="Write a task here…"
                  autoOpen
                  onAdd={(v) => insertBefore(t.key, v)}
                  onClose={() => setIns(null)}
                />
              </div>,
            );
          out.push(
            <div
              key={t.key}
              data-reorder=""
              data-key={t.key}
              className={cx('tp-item', fresh?.key === t.key && 'tp-new', p.selectedKey === t.key && 'tp-sel')}
              role="listitem"
            >
              {canInsert && i > 0 && insKey !== t.key ? (
                <button
                  type="button"
                  className="tp-ins"
                  aria-label="Add a task here"
                  onClick={() => setIns(t.key)}
                >
                  <span className="tp-ins-plus" aria-hidden="true">
                    <Icon name="plus" size={12} stroke={2.4} />
                  </span>
                </button>
              ) : null}
              <TaskRow
                title={t.title}
                id={t.id}
                done={!!t.done}
                due={t.due}
                carried={t.carried}
                comments={t.comments}
                jira={t.jira}
                project={t.project}
                reorderable
                compact={compact}
                brief={p.brief}
                planButton={p.planButton}
                calendar={cal}
                planned={calDay}
                onPlan={cal ? (v) => planTask(t, v) : undefined}
                onDueChange={cal && p.onDueChange ? (v) => p.onDueChange!(t, v) : undefined}
                onOpen={p.onOpenTask ? () => p.onOpenTask!(t) : undefined}
                onSignal={p.onSignal ? (k) => p.onSignal!(t, k) : undefined}
                onToggle={(v) => p.onToggleTask?.(t, v)}
                editing={p.editingKey === t.key}
                onRename={p.onRename ? (title) => p.onRename!(t, title) : undefined}
                onEditEnd={p.onEditEnd}
              />
            </div>,
          );
          return out;
        })}
      </div>
      {p.addLabel ? (
        <AddTask
          label={p.addLabel}
          compact={compact}
          onAdd={add}
          openKey={p.addKey}
          autoOpen={p.addKey !== undefined && p.addKey !== null}
          onClose={p.onAddClose}
        />
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
