import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  addDays,
  compareIso,
  dateShort,
  formatLong,
  mondayOf,
  tileCount,
  tileEyebrow,
  tileEyebrowShort,
  tileLabel,
  tilePreview,
  weekDays,
  weekFirstOpen,
  weekHeading,
  type IsoDate,
  type Task,
  type TaskRefResponse,
} from '@tudu/core';
import {
  DayHeader,
  EmptyState,
  Sheet,
  SheetBody,
  TaskList,
  TaskListSkeleton,
  WeekDay,
  WeekTiles,
  type TaskItem,
} from '@tudu/ui';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { setPage, showWeek, useFlash, useShownWeek } from '../../app/dayView';
import { api, meQuery } from '../../app/session';
import {
  cachedAll,
  cachedOrder,
  taskHref,
  useAllFilters,
  useAllMarks,
  useAllProjects,
  useAllScope,
  useAllWeek,
  type AllScope,
} from '../../app/allSpaces';
import { allPath, spacePath, useSpace } from '../../app/space';
import { openInJira } from '../../app/jira';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { AllBanners, FilterChips, OfflineBanner, openInSpace, toItem } from '../today/TodayPage';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import { useFolds } from './folds';
import { taskLink } from '../../app/links';

const MIN_HEIGHT: Record<Viewport, number> = { desktop: 560, tablet: 640, phone: 520 };
/** Under this width the desk's tiles go two across. */
const NARROW_PX = 1120;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < NARROW_PX);
  useEffect(() => {
    const read = () => setNarrow(window.innerWidth < NARROW_PX);
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return narrow;
}

/**
 * The week page: seven days and the Backlog. On the desk each day is a small sheet in a grid and tasks drag
 * between them; on tablets and phones the days are sections of one sheet that fold. The header turns the week
 * with its arrows and picks one from the title. Everything reads from the same day caches as Today, filled by
 * one week read.
 */
export function WeekPage() {
  const vp = useViewport();
  const me = useQuery(meQuery).data;
  const space = useSpace();
  const all = useAllScope();
  const filters = useAllFilters(all);
  const { today } = useWorkingDay();
  const online = useOnline();
  const thisMonday = mondayOf(today);
  const monday = useShownWeek() ?? thisMonday;
  useEffect(() => {
    setPage('week');
    return () => setPage(null);
  }, []);

  // The open task: in the address as its ref ("/week?task=ME-52"), so a reload and a link reopen it.
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };
  const [open, setOpen] = useState<OpenTask | null>(null);
  const resolving = useRef<string | null>(null);
  const closed = useRef<string | null>(null);
  const spaceId = space.id;
  const base = all ? allPath('week') : spacePath(space.slug, 'week');
  const filterSlug = all?.filter?.slug ?? null;
  const here = taskHref(base, null, filterSlug);
  const hrefFor = (ref: string | null | undefined) => taskHref(base, ref, filterSlug);
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => {
        if (r.day) showWeek(mondayOf(r.day), thisMonday);
        setOpen({ id: r.taskId, spaceId: r.spaceId, dir: 'next' });
      },
      () => {
        resolving.current = null;
        void navigate({ href: here, replace: true });
      },
    );
  }, [search.task, spaceId, open, thisMonday, navigate, here]);
  const openTask = (id: string, ref: string | null | undefined, dir: 'next' | 'prev' = 'next') => {
    setOpen({ id, dir, spaceId: taskStore.lastSeen(id)?.spaceId });
    closed.current = null;
    if (ref) resolving.current = ref;
    void navigate({ href: hrefFor(ref), replace: true });
  };
  const closeTask = () => {
    setOpen(null);
    closed.current = search.task ?? null;
    resolving.current = null;
    if (search.task) void navigate({ href: here, replace: true });
  };

  const week = useAllWeek(all, me?.user.id ?? '', monday, today);
  if (!me) return null;
  const failed =
    all && !week.error ? all.spaces.filter((s) => week.days.some((d) => d.failed.includes(s))) : [];
  const openSpace = all
    ? (all.spaces.find((x) => x.id === (open?.spaceId ?? taskStore.lastSeen(open?.id ?? '')?.spaceId)) ??
      all.target)
    : space;
  return (
    <div className="app-page app-week">
      <OfflineBanner online={online} all={!!all} />
      {all ? <AllBanners all={all} failed={failed} onRetry={week.refetch} /> : null}
      <WeekSheet
        all={all}
        filters={filters}
        meId={me.user.id}
        spaceId={space.id}
        monday={monday}
        today={today}
        vp={vp}
        onWeek={(m) => showWeek(m, thisMonday)}
        onOpenTask={openTask}
        openKey={open?.id}
      />
      <TaskPanel
        spaceId={openSpace.id}
        space={all ? openSpace : undefined}
        open={open}
        today={today}
        vp={vp}
        me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
        onClose={closeTask}
        onStep={(id, dir) => openTask(id, taskStore.lastSeen(id)?.ref, dir)}
        onRef={(ref) => {
          if (search.task !== ref) void navigate({ href: hrefFor(ref), replace: true });
        }}
        linkFor={taskLink}
        backFor={(day) => (day ? 'Week' : 'Backlog')}
        neighbours={all ? (d) => cachedAll(all, me.user.id, d).map((t) => t.id) : undefined}
        onOpenSpace={all ? (s, ref) => openInSpace(navigate, s, ref, open?.id) : undefined}
      />
    </div>
  );
}

interface WeekSheetProps {
  /** All spaces: every space's week, gathered; null on a space's own week. */
  all: AllScope | null;
  filters: ReturnType<typeof useAllFilters>;
  meId: string;
  spaceId: string;
  monday: IsoDate;
  today: IsoDate;
  vp: Viewport;
  onWeek: (monday: IsoDate) => void;
  onOpenTask: (id: string, ref: string | null | undefined) => void;
  openKey?: string;
}

/** The sheet: the week's header, then the tiles (desk) or the folding days (tablets and phones). */
function WeekSheet({
  all,
  filters,
  meId,
  spaceId,
  monday,
  today,
  vp,
  onWeek,
  onOpenTask,
  openKey,
}: WeekSheetProps) {
  const desk = vp === 'desktop';
  const compact = vp === 'phone';
  const narrow = useNarrow();
  const days = weekDays(monday);
  const week = useQuery({ ...taskStore.weekQuery(spaceId, monday, today), enabled: !all });
  const ready = !week.isPending;
  // The tiles read the day caches the week read filled; they ask the server for nothing on their own.
  const lists = useQueries({
    queries: days.map((d) => ({ ...taskStore.dayQuery(spaceId, d, today), enabled: ready && !all })),
  });
  const backlog = useQuery({ ...taskStore.backlogQuery(spaceId), enabled: ready && !all });
  const gathered = useAllWeek(all, meId, monday, today);
  const spaceProjects = useQuery({ ...taskStore.projectsQuery(spaceId), enabled: !all }).data ?? [];
  const projectsOf = useAllProjects(all);
  const marksFrom = addDays(monday, -42);
  const marksTo = addDays(monday, 19);
  const spaceMarks =
    useQuery({ ...taskStore.marksQuery(spaceId, marksFrom, marksTo), enabled: !all }).data ?? {};
  const allMarks = useAllMarks(all, marksFrom, marksTo);
  const marks = all ? allMarks : spaceMarks;
  const spaceOf = (id: string) => all?.spaces.find((s) => s.id === id);
  const itemOf = (t: Task) =>
    all ? toItem(t, today, projectsOf(t.spaceId), spaceOf(t.spaceId)) : toItem(t, today, spaceProjects);
  // In All spaces a tile shows what the space filter leaves, a beat behind the header (as the list narrows).
  const narrowed = (tasks: Task[] | undefined) =>
    all && filters.lagSpace ? tasks?.filter((t) => t.spaceId === filters.lagSpace) : tasks;
  const tasksOf = (day: IsoDate | null): Task[] | undefined => {
    if (all) {
      const l = day === null ? gathered.backlog : gathered.days[days.indexOf(day)];
      return l && !l.pending ? l.tasks : undefined;
    }
    return day === null ? backlog.data?.tasks : lists[days.indexOf(day)]?.data?.tasks;
  };
  const orderOf = (day: IsoDate | null) => {
    if (!all) return [];
    const l = day === null ? gathered.backlog : gathered.days[days.indexOf(day)];
    return l ? l.order : cachedOrder(all, meId, day);
  };
  const spaceIdOf = (key: string) => taskStore.lastSeen(key)?.spaceId ?? spaceId;
  const flash = useFlash();
  const folds = useFolds();

  // Turning the week: the page turns towards the week you are heading to.
  const [shown, setShown] = useState(monday);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  if (monday !== shown) {
    setShown(monday);
    setDir(monday > shown ? 'next' : 'prev');
  }
  const latest = useRef(monday);
  useLayoutEffect(() => {
    latest.current = monday;
  });

  function isOpen(key: IsoDate | 'b'): boolean {
    const kept = folds?.get(key);
    if (kept !== undefined) return kept;
    return key !== 'b' && key === weekFirstOpen(monday, today);
  }

  // A task that just landed in a folded day opens that day.
  useEffect(() => {
    if (!flash || !folds) return;
    const key = flash.day === null ? 'b' : days.includes(flash.day) ? flash.day : null;
    if (key && !isOpen(key)) folds.set(key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new flash opens a day
  }, [flash?.nonce]);

  const h = weekHeading(monday, today);
  let total = 0;
  let done = 0;
  for (const d of days)
    for (const t of narrowed(tasksOf(d)) ?? []) {
      total += 1;
      if (t.done) done += 1;
    }
  const calendarFor = (day: IsoDate) => ({ today, selected: day, marks });

  function listFor(day: IsoDate | null, tasks: TaskItem[] | undefined, pending: boolean): ReactNode {
    if (!tasks) return pending ? <TaskListSkeleton rows={3} compact /> : null;
    const past = day !== null && compareIso(day, today) < 0;
    const raw = tasksOf(day);
    const order = orderOf(day);
    return (
      <TaskList
        onSignal={(t, k) => {
          if (k === 'jira' && t.jira) openInJira(spaceIdOf(t.key), t.jira);
          else if (all) filters.onSignal(t, k, false);
        }}
        filterSpace={all ? filters.lagSpace : undefined}
        tasks={tasks}
        label={day === null ? 'Tasks in the Backlog' : `Tasks for ${formatLong(day)}`}
        compact
        brief
        group="week"
        resetKey={day ?? 'backlog'}
        locked={past}
        undated={day === null}
        planButton={day === null}
        calendar={day === null ? { today, marks } : calendarFor(day)}
        flashKey={flash && flash.day === day ? flash.id : undefined}
        selectedKey={openKey}
        onToggleTask={(t, v) => taskStore.cross(t.key, v)}
        onReorder={(_, moved) =>
          all
            ? taskStore.placeInAll(moved.key, day, moved.to, order)
            : taskStore.place(moved.key, day, moved.to)
        }
        onReceive={(key, at) =>
          all ? taskStore.moveInAll(key, day, at, order) : taskStore.place(key, day, at)
        }
        onMoveTask={(t, to, _from, at) =>
          all && at !== undefined
            ? taskStore.moveInAll(t.key, to, at, orderOf(to))
            : taskStore.place(t.key, to, at)
        }
        onKeepTask={(t) => taskStore.keep(t.key)}
        onDueChange={(t, due) => taskStore.due(t.key, due)}
        onOpenTask={(t) => onOpenTask(t.key, raw?.find((x) => x.id === t.key)?.ref ?? t.id)}
      />
    );
  }

  const failed = all ? gathered.error : week.isError && !week.data;
  const pending = all ? gathered.pending : week.isPending;
  const error = (
    <EmptyState
      tone="error"
      title={all ? 'Your spaces didn’t load.' : 'Couldn’t load this week.'}
      action="Try again"
      loading={all ? gathered.fetching : week.isFetching}
      loadingLabel="Trying again"
      onAction={() => (all ? gathered.refetch() : void week.refetch())}
    >
      Check your connection. Anything you already see stays as it is.
    </EmptyState>
  );

  const header = (
    <DayHeader
      eyebrow={compact ? h.word : h.eyebrow}
      day={h.day}
      date={h.date}
      done={done}
      total={total}
      isToday={h.isThisWeek}
      onPrev={() => onWeek(addDays(latest.current, -7))}
      onNext={() => onWeek(addDays(latest.current, 7))}
      onToday={() => onWeek(mondayOf(today))}
      weeks={{ today, selected: monday, marks, onPick: onWeek }}
      prevLabel="Previous week"
      nextLabel="Next week"
      todayLabel="Back to this week"
      pickLabel="Pick a week"
      doneNote="That’s the week"
      bare={desk}
      compact={compact}
    >
      {all ? <FilterChips all={all} filters={filters} /> : null}
    </DayHeader>
  );

  const dayTiles = days.map((d) => {
    const all_ = tasksOf(d);
    const tasks = narrowed(all_);
    const items = all_?.map(itemOf);
    const openTitles = tasks?.filter((t) => !t.done).map((t) => t.title) ?? [];
    return {
      day: d,
      items,
      count: tasks ? tileCount(tasks.length, tasks.filter((t) => t.done).length) : '',
      empty: !!tasks && tasks.length === 0,
      preview: tasks ? tilePreview(openTitles, tasks.length) : '',
      body: listFor(d, items, pending),
    };
  });
  const backlogAll = tasksOf(null);
  const backlogTasks = narrowed(backlogAll);
  const backlogItems = backlogAll?.map(itemOf);
  const backlogBody = listFor(null, backlogItems, pending);
  const backlogCount = backlogTasks ? tileCount(backlogTasks.length, 0) : '';
  const backlogEmpty = !!backlogTasks && backlogTasks.length === 0;

  if (desk) {
    return (
      <Sheet
        label={all ? 'The week, every space' : 'The week'}
        plain
        fill
        turnKey={all ? `${monday}:${filters.lagSpace ?? ''}` : monday}
        turnDir={dir}
      >
        {all ? <div className={filters.headerClass}>{header}</div> : header}
        {failed ? (
          <div className="app-week-error">{error}</div>
        ) : (
          <WeekTiles columns={narrow ? 2 : undefined}>
            {dayTiles.map((t) => (
              <WeekDay
                key={t.day}
                variant="tile"
                day={formatLong(t.day).split(' ')[0]!}
                date={dateShort(t.day)}
                eyebrow={tileEyebrow(t.day, today)}
                today={t.day === today}
                past={compareIso(t.day, today) < 0}
                count={t.count}
                empty={t.empty}
                label={tileLabel(t.day, today)}
              >
                {t.body}
              </WeekDay>
            ))}
            <WeekDay
              variant="tile"
              quiet
              day="Backlog"
              eyebrow="No date"
              count={backlogCount}
              empty={backlogEmpty}
              emptyText="Nothing waiting"
              label="Backlog"
            >
              {backlogBody}
            </WeekDay>
          </WeekTiles>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      label={all ? 'The week, every space' : 'The week'}
      fill
      minHeight={MIN_HEIGHT[vp]}
      turnKey={all ? `${monday}:${filters.lagSpace ?? ''}` : monday}
      turnDir={dir}
    >
      {all ? <div className={filters.headerClass}>{header}</div> : header}
      <SheetBody>
        {failed
          ? error
          : dayTiles.map((t) => (
              <WeekDay
                key={t.day}
                variant="section"
                day={formatLong(t.day).split(' ')[0]!}
                date={dateShort(t.day)}
                eyebrow={tileEyebrowShort(t.day, today)}
                today={t.day === today}
                past={compareIso(t.day, today) < 0}
                count={t.count}
                empty={t.empty}
                preview={t.preview}
                open={isOpen(t.day)}
                onToggle={(v) => folds?.set(t.day, v)}
                label={tileLabel(t.day, today)}
              >
                {t.body}
              </WeekDay>
            ))}
        {failed ? null : (
          <WeekDay
            variant="section"
            quiet
            day="Backlog"
            count={backlogCount}
            empty={backlogEmpty}
            emptyText="Nothing waiting"
            preview={backlogTasks?.map((t) => t.title).join(' · ') ?? ''}
            open={isOpen('b')}
            onToggle={(v) => folds?.set('b', v)}
            label="Backlog"
          >
            {backlogBody}
          </WeekDay>
        )}
      </SheetBody>
    </Sheet>
  );
}
