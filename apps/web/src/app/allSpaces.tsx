import { useQueries, useQuery } from '@tanstack/react-query';
import {
  addDays,
  gatherAll,
  spaceInitials,
  switcherOrder,
  type AllSpacesPlace,
  type IsoDate,
  type Project,
  type SpaceSummary,
  type Task,
} from '@tudu/core';
import type { TaskSpace } from '@tudu/ui';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { queryClient } from './session';
import { taskStore } from './tasks';

/**
 * All spaces (`/all`): your own tasks from every space you are in, in one list per day, in an order of your own.
 * The page is put together here from each space's own reads (the caches the space pages use), so nothing new is
 * asked of the server but your places. `?space=` narrows it to one space; the writing line and Quick Add write to
 * that space, Personal otherwise.
 */
export interface AllScope {
  /** Every space you are in, in the switcher's order (Personal first). */
  spaces: SpaceSummary[];
  /** The space the page is narrowed to (`?space=`), or null for every space. */
  filter: SpaceSummary | null;
  /** Where a task written here goes: the filtered space, else Personal. */
  target: SpaceSummary;
  /** Narrow to a space (its id), or show every space again (null). */
  setFilter: (id: string | null) => void;
  /** A space you stopped being in while the page was open: its tasks left, the banner says why. */
  gone: { name: string } | null;
  dismissGone: () => void;
}

const Ctx = createContext<AllScope | null>(null);

export function AllProvider({ value, children }: { value: AllScope; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** All spaces, when the page is in it; null on a space's own pages. */
export function useAllScope(): AllScope | null {
  return useContext(Ctx);
}

/** The space of `?space=`: a slug you are in (`me` is Personal), else none, so a stale link shows every space. */
export function filterOf(spaces: SpaceSummary[], slug: string | undefined): SpaceSummary | null {
  if (!slug) return null;
  return spaces.find((s) => s.slug === slug) ?? null;
}

/** Where a task written in All spaces goes. */
export function targetOf(spaces: SpaceSummary[], filter: SpaceSummary | null): SpaceSummary {
  return filter ?? spaces.find((s) => s.kind === 'personal') ?? spaces[0]!;
}

/** A space as a row's pill and a chip's tile. */
export function tileOf(s: SpaceSummary): TaskSpace {
  return {
    id: s.id,
    name: s.name,
    color: s.color ?? undefined,
    personal: s.kind === 'personal',
    initials: spaceInitials(s.name),
  };
}

export { switcherOrder };

const NOTHING_GONE = () => {};

/**
 * All spaces' scope for the `?space=` slug: the same object while the spaces, the filter and the banner hold, so the
 * pages under it do not re-render as the rest of the address changes (a task opening, a day turning). `setSearch`
 * edits the address as it is when called, not as it was when the scope was made.
 */
export function useAllScopeValue(
  spaces: SpaceSummary[],
  slug: string | undefined,
  setSearch: (edit: (q: URLSearchParams) => void) => void,
  gone: { name: string } | null = null,
  dismissGone: () => void = NOTHING_GONE,
): AllScope {
  const edit = useRef(setSearch);
  useEffect(() => {
    edit.current = setSearch;
  });
  const filter = filterOf(spaces, slug);
  return useMemo(
    () => ({
      spaces,
      filter,
      target: targetOf(spaces, filter),
      setFilter: (id: string | null) => {
        const next = id ? spaces.find((s) => s.id === id) : null;
        edit.current((q) => {
          if (next) q.set('space', next.slug);
          else q.delete('space');
        });
      },
      gone,
      dismissGone,
    }),
    [spaces, filter, gone, dismissGone],
  );
}

/** One list of All spaces (a day, or the Backlog), as the page shows it. */
export interface AllList {
  /** Every space's tasks of yours, gathered in All spaces' order (not narrowed: the list narrows itself). */
  tasks: Task[];
  /** The counts the header shows: of the filtered space only, while filtered. */
  done: number;
  total: number;
  /** Each row and its place, for a drag to be put among them. */
  order: Array<{ id: string; position: number | null }>;
  /** Nothing to show yet: the first read of every space is still on its way. */
  pending: boolean;
  /** Spaces whose list did not load (the rest still show). */
  failed: SpaceSummary[];
  /** No space loaded at all. */
  error: boolean;
  fetching: boolean;
  refetch: () => void;
}

const NO_TASKS: Task[] = [];

function listOf(
  scope: AllScope,
  meId: string,
  results: Array<{ data?: { tasks: Task[] }; isPending: boolean; isError: boolean; isFetching: boolean }>,
  places: AllSpacesPlace[] | undefined,
  day: IsoDate | null,
  refetch: () => void,
): AllList {
  const lists: Record<string, Task[] | undefined> = {};
  const failed: SpaceSummary[] = [];
  scope.spaces.forEach((s, i) => {
    const r = results[i];
    lists[s.id] = r?.data?.tasks;
    if (r && r.isError && !r.data) failed.push(s);
  });
  const all = gatherAll(scope.spaces, lists, places ?? [], meId, day);
  const shown = scope.filter ? gatherAll(scope.spaces, lists, places ?? [], meId, day, scope.filter.id) : all;
  const placeOf = new Map((places ?? []).filter((p) => p.day === day).map((p) => [p.taskId, p.position]));
  const pending = results.length > 0 && results.every((r) => r.isPending);
  return {
    tasks: all.tasks.length ? all.tasks : NO_TASKS,
    done: shown.done,
    total: shown.total,
    order: all.tasks.map((t) => ({ id: t.id, position: placeOf.get(t.id) ?? null })),
    pending,
    failed,
    error: results.length > 0 && failed.length === results.length,
    fetching: results.some((r) => r.isFetching),
    refetch,
  };
}

const EMPTY_SCOPE: AllScope = {
  spaces: [],
  filter: null,
  target: null as unknown as SpaceSummary,
  setFilter: () => {},
  gone: null,
  dismissGone: () => {},
};

/** One day of All spaces: each space's day (read in parallel, shared with the space pages) and your places. */
export function useAllDay(scope: AllScope | null, meId: string, day: IsoDate, today: IsoDate): AllList {
  const s = scope ?? EMPTY_SCOPE;
  const results = useQueries({ queries: s.spaces.map((x) => taskStore.dayQuery(x.id, day, today)) });
  const places = useQuery({ ...taskStore.allPlacesQuery(day, day), enabled: !!scope });
  return listOf(s, meId, results, places.data, day, () => {
    results.forEach((r) => r.isError && void r.refetch());
  });
}

/** The Backlog of All spaces. */
export function useAllBacklog(scope: AllScope | null, meId: string, today: IsoDate): AllList {
  const s = scope ?? EMPTY_SCOPE;
  const results = useQueries({ queries: s.spaces.map((x) => taskStore.backlogQuery(x.id)) });
  const places = useQuery({ ...taskStore.allPlacesQuery(today, today, true), enabled: !!scope });
  return listOf(s, meId, results, places.data, null, () => {
    results.forEach((r) => r.isError && void r.refetch());
  });
}

/**
 * A week of All spaces: one week read per space fills its day caches (as the week page does), then the seven days
 * and the Backlog are gathered from them.
 */
export function useAllWeek(
  scope: AllScope | null,
  meId: string,
  monday: IsoDate,
  today: IsoDate,
): {
  days: AllList[];
  backlog: AllList;
  pending: boolean;
  error: boolean;
  fetching: boolean;
  refetch: () => void;
} {
  const s = scope ?? EMPTY_SCOPE;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weeks = useQueries({ queries: s.spaces.map((x) => taskStore.weekQuery(x.id, monday, today)) });
  const ready = (i: number) => !weeks[i]?.isPending;
  const lists = useQueries({
    queries: days.flatMap((d) =>
      s.spaces.map((x, i) => ({ ...taskStore.dayQuery(x.id, d, today), enabled: ready(i) })),
    ),
  });
  const backlogs = useQueries({
    queries: s.spaces.map((x, i) => ({ ...taskStore.backlogQuery(x.id), enabled: ready(i) })),
  });
  const places = useQuery({
    ...taskStore.allPlacesQuery(monday, addDays(monday, 6), true),
    enabled: !!scope,
  });
  const refetch = () => weeks.forEach((w) => w.isError && void w.refetch());
  // A space whose week failed counts as failed on every day, so the banner names it.
  const wrap = (r: (typeof lists)[number], i: number) =>
    weeks[i]?.isError && !r.data ? { ...r, isError: true, isPending: false } : r;
  const n = s.spaces.length;
  return {
    days: days.map((d, k) =>
      listOf(
        s,
        meId,
        lists.slice(k * n, k * n + n).map((r, i) => wrap(r, i)),
        places.data,
        d,
        refetch,
      ),
    ),
    backlog: listOf(
      s,
      meId,
      backlogs.map((r, i) => wrap(r, i)),
      places.data,
      null,
      refetch,
    ),
    pending: n > 0 && weeks.every((w) => w.isPending),
    error: n > 0 && weeks.every((w) => w.isError && !w.data),
    fetching: weeks.some((w) => w.isFetching),
    refetch,
  };
}

/** Each space's projects, for the rows' project pills (a task's project is from its own space). */
export function useAllProjects(scope: AllScope | null): (spaceId: string) => Project[] {
  const s = scope ?? EMPTY_SCOPE;
  const results = useQueries({ queries: s.spaces.map((x) => taskStore.projectsQuery(x.id)) });
  const by = new Map(s.spaces.map((x, i) => [x.id, results[i]?.data ?? []]));
  return (id) => by.get(id) ?? [];
}

/** The calendar's dots across every space: each day's count, added up. */
export function useAllMarks(scope: AllScope | null, from: IsoDate, to: IsoDate): Record<IsoDate, number> {
  const s = scope ?? EMPTY_SCOPE;
  const results = useQueries({ queries: s.spaces.map((x) => taskStore.marksQuery(x.id, from, to)) });
  const out: Record<IsoDate, number> = {};
  for (const r of results)
    for (const [d, n] of Object.entries(r.data ?? {})) out[d as IsoDate] = (out[d as IsoDate] ?? 0) + n;
  return out;
}

/** The value as it was a moment ago: a filter change shows in the header at once and in the list `ms` later. */
export function useLagged<T>(value: T, ms = 100): T {
  const [lagged, setLagged] = useState(value);
  useEffect(() => {
    if (Object.is(value, lagged)) return;
    const t = setTimeout(() => setLagged(value), ms);
    return () => clearTimeout(t);
  }, [value, lagged, ms]);
  return lagged;
}

/** How long the filter chip row takes to close, and a chip to fade when another stays. */
export const CHIP_ROW_MS = 180;
export const CHIP_OUT_MS = 150;

/**
 * The filters of an All spaces page, as on the canvas: the space (in the address) and, on Today, a project (for the
 * visit). A pill press filters (or clears, pressed again); the chip row under the title opens and closes; the list
 * keeps its old filter for a beat and then turns.
 */
export function useAllFilters(scope: AllScope | null) {
  const [project, setProject] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [out, setOut] = useState<'sp' | 'pr' | null>(null);
  const [turns, setTurns] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const space = scope?.filter?.id ?? null;
  const lagSpace = useLagged(space);
  const lagProject = useLagged(project);
  const later = (ms: number, fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      fn();
    }, ms);
  };
  // The space's filter goes in the address; a project filter, only for this page.
  const off = (which: 'sp' | 'pr') => {
    const other = which === 'sp' ? !!project : !!space;
    if (other) setOut(which);
    else setClosing(true);
    later(other ? CHIP_OUT_MS : CHIP_ROW_MS, () => {
      setOut(null);
      setClosing(false);
      setTurns((n) => n + 1);
      if (which === 'sp') scope?.setFilter(null);
      else setProject(null);
    });
  };
  const clearAll = () => {
    if (!space && !project) return;
    setClosing(true);
    later(CHIP_ROW_MS, () => {
      setClosing(false);
      setOut(null);
      setTurns((n) => n + 1);
      setProject(null);
      scope?.setFilter(null);
    });
  };
  return {
    space,
    project,
    /** What the list narrows by, a beat behind the header. */
    lagSpace,
    lagProject,
    /** The list turns on each change of filter. */
    turnKey: `f${turns}:${lagSpace ?? ''}:${lagProject ?? ''}`,
    turnDir: (space || project ? 'next' : 'prev') as 'next' | 'prev',
    headerClass: closing ? 'app-all-dh app-all-closing' : 'app-all-dh',
    spaceChipClass: out === 'sp' ? 'app-all-chipw app-all-out' : 'app-all-chipw',
    projectChipClass: out === 'pr' ? 'app-all-chipw app-all-out' : 'app-all-chipw',
    onSignal: (t: { inSpace?: { id: string }; project?: { name: string } }, k: string, projects = true) => {
      if (k === 'space' && t.inSpace) {
        if (space === t.inSpace.id) off('sp');
        else {
          setTurns((n) => n + 1);
          scope?.setFilter(t.inSpace.id);
        }
      }
      if (projects && k === 'project' && t.project) {
        if (project === t.project.name) off('pr');
        else {
          setTurns((n) => n + 1);
          setProject(t.project.name);
        }
      }
    },
    clearSpace: () => off('sp'),
    clearProject: () => off('pr'),
    clearAll,
  };
}

/** "Write the next thing in Northwind…": where a task written in All spaces goes. */
export function writeWords(target: Pick<SpaceSummary, 'name'>): string {
  return `Write the next thing in ${target.name}…`;
}

/** "Nothing for Pilot Farm today.", "Nothing for Home on Fri.": a filtered day with nothing of that space. */
export function filteredWords(name: string, dayName: string, isToday: boolean): string {
  return `Nothing for ${name}${isToday ? ' today.' : ` on ${dayName}.`}`;
}

/** The empty day of All spaces. */
export function emptyAllWords(dayName: string, isToday: boolean): string {
  return isToday ? 'Nothing planned today, in any space.' : `Nothing planned for ${dayName}, in any space.`;
}

/** The Backlog's count: "4 tasks in every space", "1 task in Northwind", "2 crossed off in every space". */
export function allBacklogCount(n: number, view: 'open' | 'done', filter: string | null): string {
  const words = view === 'done' ? `${n} crossed off` : `${n} ${n === 1 ? 'task' : 'tasks'}`;
  return `${words} ${filter ? `in ${filter}` : 'in every space'}`;
}

/**
 * A day of All spaces as this tab has it cached, whatever page read it: for the panel's arrows and for a drag onto
 * a day that is not on screen. Narrowed like the page.
 */
export function cachedAll(scope: AllScope, meId: string, day: IsoDate | null, narrow = true): Task[] {
  const lists: Record<string, Task[] | undefined> = {};
  for (const s of scope.spaces) lists[s.id] = taskStore.cached(s.id, day);
  const byTask = new Map<string, AllSpacesPlace>();
  for (const [, data] of queryClient.getQueriesData<AllSpacesPlace[]>({ queryKey: ['all-places'] }))
    for (const p of data ?? []) if (p.day === day) byTask.set(p.taskId, p);
  return gatherAll(
    scope.spaces,
    lists,
    [...byTask.values()],
    meId,
    day,
    narrow ? (scope.filter?.id ?? null) : null,
  ).tasks;
}

/** The order to put a task among on a day of All spaces (every space, not narrowed), from the cache. */
export function cachedOrder(
  scope: AllScope,
  meId: string,
  day: IsoDate | null,
): Array<{ id: string; position: number | null }> {
  const byTask = new Map<string, number>();
  for (const [, data] of queryClient.getQueriesData<AllSpacesPlace[]>({ queryKey: ['all-places'] }))
    for (const p of data ?? []) if (p.day === day) byTask.set(p.taskId, p.position);
  return cachedAll(scope, meId, day, false).map((t) => ({ id: t.id, position: byTask.get(t.id) ?? null }));
}

/** A page's address with the open task (`?task=`), and in All spaces the filter (`?space=`) kept. */
export function taskHref(base: string, ref: string | null | undefined, filter?: string | null): string {
  const q = new URLSearchParams();
  if (filter) q.set('space', filter);
  if (ref) q.set('task', ref);
  const qs = q.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}
