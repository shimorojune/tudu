import { dayWord, isoToday, type IsoDate } from '@tudu/core';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { copyText, COPY_FAILED_WORDS, COPY_ID_FAILED_WORDS } from '../lib/clipboard';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { closeRow, openRow, scrollerOf, settleFrom } from '../lib/motion';
import {
  itemByKey,
  landFlight,
  moveItem,
  swallowNextClick,
  TOUCH_HOLD_MS,
  TOUCH_SLOP_PX,
  useDropGroup,
  useReorder,
} from '../lib/reorder';
import { rowMenuModel, type RowMenuAct, type RowMenuProject } from '../lib/rowMenu';
import { AddTask } from './AddTask';
import type { MiniCalendarProps } from './MiniCalendar';
import { RowMenu, RowSheet, type RowMenuCloseWhy } from './RowMenu';
import type { SubtaskItem } from './SubtaskList';
import {
  TaskRow,
  type TaskCarried,
  type TaskDue,
  type TaskProject,
  type TaskSignal,
  type TaskSpace,
} from './TaskRow';
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
  /** All spaces: the space it lives in, shown as a pill in its byline. */
  inSpace?: TaskSpace;
  subtasks?: SubtaskItem[];
  /** Someone else's task (a shared space): the row menu only opens it and copies its link or ID. */
  readOnly?: boolean;
}

/** The row menu: right-click a row (Shift+F10, or press and hold on touch). */
export interface TaskListMenu {
  /** The projects a task can move to (its own space's); `undefined` while they load. Leave out: no Project item. */
  projects?: (task: TaskItem) => RowMenuProject[] | undefined;
  onSetProject?: (task: TaskItem, projectId: string | null) => void;
  /** Delete task: the row folds away first. Leave out: no Delete item. */
  onDelete?: (task: TaskItem) => void;
  /** Undo on the "Task deleted" toast. */
  onRestore?: (task: TaskItem) => void;
  /** Copy link, where the list's own `linkFor` is not set (the week's tiles copy the ID from the chip). */
  linkFor?: (task: TaskItem) => string | undefined;
  /** Someone else's task: open and copy only (as `TaskItem.readOnly`). */
  readOnly?: (task: TaskItem) => boolean;
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
  /** A task's own page: clicking a row's ID copies it. */
  linkFor?: (task: TaskItem) => string | undefined;
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
  /** All spaces: a space's id; only its tasks show, and like `filter` the "+" and dragging between lists turn off. */
  filterSpace?: string | null;
  /** A task added from outside the list (Quick Add): it opens its gap and gets the wash, on mount too. */
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
  /** Takes no drops from the group (a day gone by): rows can still be dragged out of it. */
  locked?: boolean;
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
  /**
   * The Backlog: a crossed-off row waits a beat (the tick and sparkle play), then folds away with a toast and
   * Undo. The wait in ms, or `true` for 900. `onLeave` fires once it has gone; `onToggleTask` never does.
   */
  leaveDone?: boolean | number;
  /** The Backlog's Crossed off view: unticking a row sends it away the same way. */
  leaveUndone?: boolean | number;
  /** The toast's words: "Crossed off", or "Back in the Backlog". */
  leaveToast?: string;
  unleaveToast?: string;
  /** A row left the list (leaveDone or leaveUndone): commit the tick. */
  onLeave?: (task: TaskItem, done: boolean) => void;
  /** Undo on that toast: put it back at the index it had, as it was. */
  onUnleave?: (task: TaskItem, done: boolean, at: number) => void;
  /** No dragging, no grip, no Alt-arrows: a list in a fixed order (the Crossed off view). */
  static?: boolean;
  /** Subtasks under a row, folded out from its byline. */
  onAddSubtask?: (task: TaskItem, title: string) => void;
  onRenameSubtask?: (task: TaskItem, sub: SubtaskItem, title: string) => void;
  onToggleSubtask?: (task: TaskItem, sub: SubtaskItem, done: boolean) => void;
  onReorderSubtask?: (task: TaskItem, sub: SubtaskItem, from: number, to: number) => void;
  onDeleteSubtask?: (task: TaskItem, sub: SubtaskItem, index: number) => void;
  onRestoreSubtask?: (task: TaskItem, sub: SubtaskItem, index: number) => void;
  /** Right-click a row for its menu (and Shift+F10, and press and hold on touch). Leave out for read-only lists. */
  menu?: TaskListMenu;
}

/** How long a new or dropped row keeps its wash. */
export const FRESH_MS = 1400;
/** How long a crossed-off row waits before it folds away from the Backlog, so the tick is seen. */
export const LEAVE_MS = 900;

/**
 * A list of TaskRows people reorder by dragging (or Alt with the arrow keys). One plain list: the order is the order
 * you drag them into. A new task opens its gap and settles in with a soft wash; the "+" between two rows writes a
 * task in that spot; lists in a group trade rows. The list is controlled: it shows `tasks` and reports changes.
 */
export function TaskList(p: TaskListProps) {
  const { tasks, compact, filter, filterSpace } = p;
  // Narrowed by a project or a space: a slice of the list, so slotting in and trading rows are off.
  const narrowed = !!filter || !!filterSpace;
  const ref = useRef<HTMLDivElement | null>(null);
  const [fresh, setFresh] = useState<{ key: string; follow?: 'add' | 'out' } | null>(null);
  const [insKey, setIns] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const opened = useRef<string | null>(null);
  const stopOpen = useRef<(() => void) | null>(null);
  const keyFlip = useRef<{ key: string; top: number; focus?: HTMLElement } | null>(null);
  // Rows on their way out (leaveDone, leaveUndone): ticked as asked, waiting for their beat before they fold.
  const [leaving, setLeaving] = useState<Record<string, boolean>>({});
  const leaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = leaveTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // A new day starts fresh; a task added from outside opens its gap.
  const [seenReset, setSeenReset] = useState(p.resetKey);
  const [seenFlash, setSeenFlash] = useState<string | undefined>(undefined);
  if (p.resetKey !== seenReset) {
    setSeenReset(p.resetKey);
    setFresh(null);
    setIns(null);
  }
  if (p.flashKey !== seenFlash) {
    setSeenFlash(p.flashKey);
    if (p.flashKey) setFresh({ key: p.flashKey, follow: 'out' });
  }

  const shown = narrowed
    ? tasks.filter(
        (t) => (!filter || t.project?.name === filter) && (!filterSpace || t.inSpace?.id === filterSpace),
      )
    : tasks;

  // A fresh row opens its gap in the same frame it first appears, so it never shows at full size first.
  useLayoutEffect(() => {
    if (!fresh || opened.current === fresh.key || !ref.current) return;
    const el = itemByKey(ref.current, fresh.key);
    if (!el) return;
    opened.current = fresh.key;
    stopOpen.current?.();
    stopOpen.current = openRow(el, fresh.follow ?? null);
    // dropped here from another list: the lifted copy glides onto the row as its gap opens
    landFlight(el);
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

  // locateKey: scroll a task into the middle, focus it, flash it. The wait survives re-renders (the page may
  // still be settling after a turn); only another key or unmounting stops it.
  const seenLocate = useRef<string | null>(null);
  const locateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Unmounting drops a pending glow; the key is forgotten too, so a list that mounts again (StrictMode mounts twice
  // in development) glows the row after all.
  useEffect(
    () => () => {
      if (locateTimer.current) clearTimeout(locateTimer.current);
      locateTimer.current = null;
      seenLocate.current = null;
    },
    [],
  );
  useEffect(() => {
    const lk = p.locateKey;
    if (!lk || lk === seenLocate.current || !ref.current) return;
    const key = lk.split(':')[0]!;
    if (!tasks.some((t) => t.key === key || t.id === key)) return;
    seenLocate.current = lk;
    const hit = tasks.find((t) => t.key === key || t.id === key)!;
    if (locateTimer.current) clearTimeout(locateTimer.current);
    locateTimer.current = setTimeout(() => {
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
      // Focus the row unless something over the page (a dialog, the search panel) has the focus by now.
      const active = document.activeElement;
      if (!active || active === document.body || !active.closest('[role="dialog"]'))
        f?.focus({ preventScroll: true });
    }, 240);
  }, [p.locateKey, tasks]);

  // Reordering inside this list (drag, or Alt with an arrow key) and rows handed over from another list.
  function reorder(from: number, to: number, key: string) {
    const nextShown = moveItem(shown, from, to);
    let next = nextShown;
    let toFull = to;
    if (narrowed) {
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
  const down = useReorder(ref, reorder, {
    group: narrowed ? null : p.group,
    onHoldRelease: p.menu ? (key) => openMenu(key, 0, 0, 'touch') : undefined,
  });
  useDropGroup(narrowed || p.locked ? null : p.group, ref, (key, at) => {
    p.onReceive?.(key, at);
    setFresh({ key, follow: 'out' });
    opened.current = null;
  });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (p.menu && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      const item = rowOf(e.target);
      if (!item || (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      const r = (item.querySelector<HTMLElement>('.tp-title > .tp-strike') ?? item).getBoundingClientRect();
      openMenu(item.getAttribute('data-key')!, r.left, r.bottom + 4, 'key');
      return;
    }
    if (p.static) return;
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
  const canInsert = !compact && p.insertable !== false && !narrowed && !!p.onAdd;

  // Crossing off (or unticking) a row that leaves this list: it waits a beat ticked, then folds away with Undo.
  const leaves = (done: boolean) => (done ? p.leaveDone : p.leaveUndone);
  function toggleTask(t: TaskItem, done: boolean) {
    const leave = leaves(done);
    const timers = leaveTimers.current;
    if (!leave) {
      // Ticked back within the beat: it never left, and nothing is sent.
      if (timers.has(t.key)) {
        clearTimeout(timers.get(t.key));
        timers.delete(t.key);
        setLeaving((l) => {
          const { [t.key]: _gone, ...rest } = l;
          return rest;
        });
        return;
      }
      p.onToggleTask?.(t, done);
      return;
    }
    setLeaving((l) => ({ ...l, [t.key]: done }));
    const wait = typeof leave === 'number' ? leave : LEAVE_MS;
    timers.set(
      t.key,
      setTimeout(() => {
        timers.delete(t.key);
        const at = tasks.findIndex((x) => x.key === t.key);
        const el = ref.current ? itemByKey(ref.current, t.key) : null;
        closeRow(el, () => {
          setLeaving((l) => {
            const { [t.key]: _gone, ...rest } = l;
            return rest;
          });
          p.onLeave?.(t, done);
          requestAnimationFrame(() => {
            if (el?.isConnected) {
              el.style.height = '';
              el.style.opacity = '';
              el.style.overflow = '';
              el.style.pointerEvents = '';
            }
          });
          showToast(done ? (p.leaveToast ?? 'Crossed off') : (p.unleaveToast ?? 'Back in the list'), {
            action: 'Undo',
            onAction: () => {
              p.onUnleave?.(t, done, at);
              opened.current = null;
              setFresh({ key: t.key });
            },
          });
        });
      }, wait),
    );
  }

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

  // The row menu. One open at a time; `n` names it, so a menu still fading out never closes the one after it.
  const [ctx, setCtx] = useState<{
    key: string;
    x: number;
    y: number;
    kb: boolean;
    sheet: boolean;
    n: number;
  } | null>(null);
  const ctxN = useRef(0);
  const [asked, setAsked] = useState<{
    key: string;
    k: 'plan' | 'carried' | 'due';
    el: HTMLElement;
    n: number;
  } | null>(null);
  function rowOf(target: EventTarget | null): HTMLElement | null {
    const item = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-reorder]');
    return item && item.parentNode === ref.current ? item : null;
  }
  function openMenu(key: string, x: number, y: number, how: 'mouse' | 'key' | 'touch') {
    if (!p.menu || !shown.some((t) => t.key === key)) return;
    ctxN.current += 1;
    setCtx({ key, x, y, kb: how === 'key', sheet: how === 'touch', n: ctxN.current });
  }
  function onContextMenu(e: MouseEvent<HTMLDivElement>) {
    if (!p.menu) return;
    const item = rowOf(e.target);
    // Text being written keeps the system's menu (spelling, paste); so does the paper around the rows.
    if (!item || (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    const key = item.getAttribute('data-key')!;
    // The keyboard's own `contextmenu` (Shift+F10, the Menu key) has no button 2 and no pointer: it opens the menu
    // under the title with the first item focused, as the key does (also when it follows the key's own open).
    const pointer = (e.nativeEvent as globalThis.PointerEvent).pointerType;
    if (e.button !== 2 && !e.ctrlKey && !pointer) {
      const r = (item.querySelector<HTMLElement>('.tp-title > .tp-strike') ?? item).getBoundingClientRect();
      openMenu(key, r.left, r.bottom + 4, 'key');
      return;
    }
    openMenu(key, e.clientX, e.clientY, 'mouse');
  }
  // A list in a fixed order has no drag to share the hold with: a touch hold of its own opens the sheet.
  function holdDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch' || !p.menu) return;
    const item = rowOf(e.target);
    if (
      !item ||
      (e.target as HTMLElement).closest('button, input, textarea, select, a, [contenteditable="true"]')
    )
      return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const key = item.getAttribute('data-key')!;
    let armed = false;
    const timer = setTimeout(() => {
      armed = true;
      item.classList.add('tp-ctx-hold');
    }, TOUCH_HOLD_MS);
    const done = () => {
      clearTimeout(timer);
      item.classList.remove('tp-ctx-hold');
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', done);
    };
    const mv = (ev: globalThis.PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > TOUCH_SLOP_PX) done();
    };
    const up = () => {
      const go = armed;
      done();
      if (!go) return;
      swallowNextClick();
      openMenu(key, x0, y0, 'touch');
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', done);
  }
  function closeMenu(n: number, why?: RowMenuCloseWhy) {
    setCtx((c) => (c && c.n === n ? null : c));
    if (why === 'key' && ctx && ref.current) {
      const el = itemByKey(ref.current, ctx.key);
      el?.querySelector<HTMLElement>('.tp-strike[tabindex]')?.focus({ preventScroll: true });
    }
  }
  const linkOf = (t: TaskItem) => p.linkFor?.(t) ?? p.menu?.linkFor?.(t);
  function canFor(t: TaskItem) {
    return {
      open: !!p.onOpenTask,
      toggle: true,
      move: !!cal && !!p.onMoveTask,
      due: !!cal && !!p.onDueChange,
      project: !!p.menu?.projects && !!p.menu.onSetProject,
      link: !!linkOf(t),
      delete: !!p.menu?.onDelete,
    };
  }
  function menuEntries(t: TaskItem) {
    return rowMenuModel(
      { ...t, readOnly: !!t.readOnly || !!p.menu?.readOnly?.(t) },
      {
        today: calToday,
        day: calDay,
        projects: p.menu?.projects?.(t),
        can: canFor(t),
      },
    );
  }
  function act(t: TaskItem, a: RowMenuAct) {
    const el = ref.current ? itemByKey(ref.current, t.key) : null;
    const anchor = el?.querySelector<HTMLElement>('.tp-title > .tp-strike') ?? el;
    switch (a.k) {
      case 'open':
        p.onOpenTask?.(t);
        return;
      case 'toggle':
        // The row's own checkbox, so the ink, the spark and the Backlog's fold-away all play as they do on a tap.
        el?.querySelector<HTMLButtonElement>('button.tp-cb')?.click();
        return;
      case 'move':
        planTask(t, a.to);
        return;
      case 'pickDay':
      case 'pickDue':
        if (anchor)
          setAsked({
            key: t.key,
            k: a.k === 'pickDue' ? 'due' : calDay === null ? 'plan' : 'carried',
            el: anchor,
            n: (asked?.n ?? 0) + 1,
          });
        return;
      case 'due':
        p.onDueChange?.(t, a.to);
        return;
      case 'project':
        p.menu?.onSetProject?.(t, a.id);
        return;
      case 'copyLink':
      case 'copyId': {
        const link = a.k === 'copyLink' ? linkOf(t) : undefined;
        const text = link ?? t.id;
        if (!text) return;
        void copyText(text).then((ok) => {
          if (!ok) showToast(link ? COPY_FAILED_WORDS : COPY_ID_FAILED_WORDS);
          else showToast(link ? 'Link copied' : `Copied ${t.id}`);
        });
        return;
      }
      case 'delete': {
        const menu = p.menu;
        closeRow(el, () => {
          menu?.onDelete?.(t);
          requestAnimationFrame(() => {
            if (el?.isConnected) {
              el.style.height = '';
              el.style.opacity = '';
              el.style.overflow = '';
              el.style.pointerEvents = '';
            }
          });
          showToast('Task deleted', {
            action: 'Undo',
            onAction: () => {
              menu?.onRestore?.(t);
              opened.current = null;
              setFresh({ key: t.key });
            },
          });
        });
        return;
      }
    }
  }
  const ctxTask = ctx ? shown.find((t) => t.key === ctx.key) : undefined;
  let menuNode = null;
  if (ctx && ctxTask) {
    const n = ctx.n;
    menuNode = ctx.sheet ? (
      <RowSheet
        key={n}
        entries={menuEntries(ctxTask)}
        title={ctxTask.title}
        byline={[ctxTask.id, ctxTask.project?.name].filter(Boolean).join(' · ')}
        projectColor={ctxTask.project?.color}
        onPick={(a) => act(ctxTask, a)}
        onClose={() => closeMenu(n)}
      />
    ) : (
      <RowMenu
        key={n}
        entries={menuEntries(ctxTask)}
        x={ctx.x}
        y={ctx.y}
        keyboard={ctx.kb}
        label={`Actions for ${ctxTask.title}`}
        onPick={(a) => act(ctxTask, a)}
        onClose={(why) => closeMenu(n, why)}
      />
    );
  }

  return (
    <div className="tp-root">
      <div
        ref={ref}
        className="tp-list"
        onPointerDown={p.static ? (p.menu ? holdDown : undefined) : down}
        onKeyDown={p.static && !p.menu ? undefined : onKeyDown}
        onContextMenu={p.menu ? onContextMenu : undefined}
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
              className={cx(
                'tp-item',
                fresh?.key === t.key && 'tp-new',
                p.selectedKey === t.key && 'tp-sel',
                ctx?.key === t.key && 'tp-ctx-on',
              )}
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
                link={p.linkFor?.(t)}
                done={leaving[t.key] ?? !!t.done}
                due={t.due}
                carried={t.carried}
                comments={t.comments}
                jira={t.jira}
                project={t.project}
                inSpace={t.inSpace}
                reorderable={!p.static}
                compact={compact}
                brief={p.brief}
                planButton={p.planButton}
                calendar={cal}
                planned={calDay}
                onPlan={cal ? (v) => planTask(t, v) : undefined}
                onDueChange={cal && p.onDueChange ? (v) => p.onDueChange!(t, v) : undefined}
                pickRequest={asked?.key === t.key ? asked : null}
                onOpen={p.onOpenTask ? () => p.onOpenTask!(t) : undefined}
                onSignal={p.onSignal ? (k) => p.onSignal!(t, k) : undefined}
                onToggle={(v) => toggleTask(t, v)}
                subtasks={t.subtasks}
                onAddSubtask={p.onAddSubtask ? (title) => p.onAddSubtask!(t, title) : undefined}
                onRenameSubtask={
                  p.onRenameSubtask ? (s, title) => p.onRenameSubtask!(t, s, title) : undefined
                }
                onToggleSubtask={p.onToggleSubtask ? (s, v) => p.onToggleSubtask!(t, s, v) : undefined}
                onReorderSubtask={
                  p.onReorderSubtask ? (s, from, to) => p.onReorderSubtask!(t, s, from, to) : undefined
                }
                onDeleteSubtask={p.onDeleteSubtask ? (s, i) => p.onDeleteSubtask!(t, s, i) : undefined}
                onRestoreSubtask={p.onRestoreSubtask ? (s, i) => p.onRestoreSubtask!(t, s, i) : undefined}
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
      {menuNode}
    </div>
  );
}
