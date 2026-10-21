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
  type TaskRefResponse,
} from '@tudu/core';
import {
  Banner,
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
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { toItem } from '../today/TodayPage';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import { useFolds } from './folds';

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
  const space = me?.spaces.find((s) => s.kind === 'personal') ?? me?.spaces[0];
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
  const spaceId = space?.id;
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => {
        if (r.day) showWeek(mondayOf(r.day), thisMonday);
        setOpen({ id: r.taskId, dir: 'next' });
      },
      () => {
        resolving.current = null;
        void navigate({ to: '/week', search: {}, replace: true });
      },
    );
  }, [search.task, spaceId, open, thisMonday, navigate]);
  const openTask = (id: string, ref: string | null | undefined, dir: 'next' | 'prev' = 'next') => {
    setOpen({ id, dir });
    closed.current = null;
    if (ref) resolving.current = ref;
    void navigate({ to: '/week', search: ref ? { task: ref } : {}, replace: true });
  };
  const closeTask = () => {
    setOpen(null);
    closed.current = search.task ?? null;
    resolving.current = null;
    if (search.task) void navigate({ to: '/week', search: {}, replace: true });
  };

  if (!space || !me) return null;
  return (
    <div className="app-page app-week">
      {!online ? (
        <Banner tone="warning" title="You’re offline.">
          Changes are saved here and sync when you’re back.
        </Banner>
      ) : null}
      <WeekSheet
        spaceId={space.id}
        monday={monday}
        today={today}
        vp={vp}
        onWeek={(m) => showWeek(m, thisMonday)}
        onOpenTask={openTask}
        openKey={open?.id}
      />
      <TaskPanel
        spaceId={space.id}
        open={open}
        today={today}
        vp={vp}
        me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
        onClose={closeTask}
        onStep={(id, dir) => openTask(id, taskStore.lastSeen(id)?.ref, dir)}
        onRef={(ref) => {
          if (search.task !== ref) void navigate({ to: '/week', search: { task: ref }, replace: true });
        }}
        linkFor={(ref) => `${window.location.origin}/t/${ref}`}
        backFor={(day) => (day ? 'Week' : 'Backlog')}
      />
    </div>
  );
}

interface WeekSheetProps {
  spaceId: string;
  monday: IsoDate;
  today: IsoDate;
  vp: Viewport;
  onWeek: (monday: IsoDate) => void;
  onOpenTask: (id: string, ref: string | null | undefined) => void;
  openKey?: string;
}

/** The sheet: the week's header, then the tiles (desk) or the folding days (tablets and phones). */
function WeekSheet({ spaceId, monday, today, vp, onWeek, onOpenTask, openKey }: WeekSheetProps) {
  const desk = vp === 'desktop';
  const compact = vp === 'phone';
  const narrow = useNarrow();
  const days = weekDays(monday);
  const week = useQuery(taskStore.weekQuery(spaceId, monday, today));
  const ready = !week.isPending;
  // The tiles read the day caches the week read filled; they ask the server for nothing on their own.
  const lists = useQueries({
    queries: days.map((d) => ({ ...taskStore.dayQuery(spaceId, d, today), enabled: ready })),
  });
  const backlog = useQuery({ ...taskStore.backlogQuery(spaceId), enabled: ready });
  const projects = useQuery(taskStore.projectsQuery(spaceId)).data ?? [];
  const marks = useQuery(taskStore.marksQuery(spaceId, addDays(monday, -42), addDays(monday, 19))).data ?? {};
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

  // A task that just landed in a folded day opens that day.
  useEffect(() => {
    if (!flash || !folds) return;
    const key = flash.day === null ? 'b' : days.includes(flash.day) ? flash.day : null;
    if (key && !isOpen(key)) folds.set(key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new flash opens a day
  }, [flash?.nonce]);

  function isOpen(key: IsoDate | 'b'): boolean {
    const kept = folds?.get(key);
    if (kept !== undefined) return kept;
    return key !== 'b' && key === weekFirstOpen(monday, today);
  }

  const h = weekHeading(monday, today);
  let total = 0;
  let done = 0;
  for (const q of lists)
    for (const t of q.data?.tasks ?? []) {
      total += 1;
      if (t.done) done += 1;
    }
  const calendarFor = (day: IsoDate) => ({ today, selected: day, marks });

  function listFor(day: IsoDate | null, tasks: TaskItem[] | undefined, pending: boolean): ReactNode {
    if (!tasks) return pending ? <TaskListSkeleton rows={3} compact /> : null;
    const past = day !== null && compareIso(day, today) < 0;
    const raw = day === null ? backlog.data?.tasks : lists[days.indexOf(day)]?.data?.tasks;
    return (
      <TaskList
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
        onReorder={(_, moved) => taskStore.place(moved.key, day, moved.to)}
        onReceive={(key, at) => taskStore.place(key, day, at)}
        onMoveTask={(t, to, _from, at) => taskStore.place(t.key, to, at)}
        onKeepTask={(t) => taskStore.keep(t.key)}
        onDueChange={(t, due) => taskStore.due(t.key, due)}
        onOpenTask={(t) => onOpenTask(t.key, raw?.find((x) => x.id === t.key)?.ref ?? t.id)}
      />
    );
  }

  const failed = week.isError && !week.data;
  const error = (
    <EmptyState
      tone="error"
      title="Couldn’t load this week."
      action="Try again"
      loading={week.isFetching}
      loadingLabel="Trying again"
      onAction={() => void week.refetch()}
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
    />
  );

  const dayTiles = days.map((d, i) => {
    const q = lists[i]!;
    const tasks = q.data?.tasks;
    const items = tasks?.map((t) => toItem(t, today, projects));
    const openTitles = tasks?.filter((t) => !t.done).map((t) => t.title) ?? [];
    return {
      day: d,
      items,
      count: tasks ? tileCount(tasks.length, tasks.filter((t) => t.done).length) : '',
      empty: !!tasks && tasks.length === 0,
      preview: tasks ? tilePreview(openTitles, tasks.length) : '',
      body: listFor(d, items, week.isPending),
    };
  });
  const backlogTasks = backlog.data?.tasks;
  const backlogItems = backlogTasks?.map((t) => toItem(t, today, projects));
  const backlogBody = listFor(null, backlogItems, week.isPending);
  const backlogCount = backlogTasks ? tileCount(backlogTasks.length, 0) : '';
  const backlogEmpty = !!backlogTasks && backlogTasks.length === 0;

  if (desk) {
    return (
      <Sheet label="The week" plain fill turnKey={monday} turnDir={dir}>
        {header}
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
    <Sheet label="The week" fill minHeight={MIN_HEIGHT[vp]} turnKey={monday} turnDir={dir}>
      {header}
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
