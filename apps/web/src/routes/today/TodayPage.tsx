import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  addDays,
  carriedLabel,
  peopleHere,
  welcomeTitle,
  dayHeading,
  daysInMonth,
  dueLabel,
  nightWords,
  type IsoDate,
  type Project,
  type SpaceSummary,
  type Task,
  type TaskRefResponse,
} from '@tudu/core';
import {
  Banner,
  Chip,
  DayHeader,
  EmptyState,
  Sheet,
  SheetBody,
  Spread,
  SpreadPage,
  TaskList,
  TaskListSkeleton,
  type TaskItem,
} from '@tudu/ui';
import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react';
import {
  setSecondDay,
  showDay,
  useDayView,
  useFlash,
  useLocate,
  useNewTaskAsk,
  useShownDay,
} from '../../app/dayView';
import { openMembers } from '../../app/dayView';
import { api, meQuery } from '../../app/session';
import {
  cachedAll,
  cachedOrder,
  emptyAllWords,
  filteredWords,
  taskHref,
  tileOf,
  useAllDay,
  useAllFilters,
  useAllMarks,
  useAllProjects,
  useAllScope,
  writeWords,
  type AllScope,
} from '../../app/allSpaces';
import { openQuickAdd } from '../../app/dayView';
import { allPath, spacePath, useSpace } from '../../app/space';
import { openInJira } from '../../app/jira';
import { useFirstRunOpen } from '../../app/firstRun';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { TaskPanel, type OpenTask } from './TaskPanel';
import { taskLink, rowLink } from '../../app/links';

/** A swipe this wide (and wider than it is tall) turns the day on phones. */
const SWIPE_PX = 60;

const MIN_HEIGHT: Record<Viewport, number> = { desktop: 560, tablet: 640, phone: 520 };

/** A task as a row: the words of its byline for the day shown; in All spaces, its space's pill too. */
export function toItem(t: Task, today: IsoDate, projects: Project[], space?: SpaceSummary): TaskItem {
  const project = t.projectId ? projects.find((p) => p.id === t.projectId) : undefined;
  return {
    ...(space ? { inSpace: tileOf(space) } : {}),
    key: t.id,
    id: t.ref,
    title: t.title,
    done: t.done,
    project: project ? { name: project.name, color: project.color } : undefined,
    due: t.due && !t.done ? dueLabel(t.due, today) : undefined,
    carried: t.carriedFrom && !t.done ? carriedLabel(t.carriedFrom, today) : undefined,
    comments: t.commentCount || undefined,
    jira: t.jira ?? undefined,
    subtasks: t.subtasks.map((s) => ({ key: s.id, title: s.title, done: s.done })),
  };
}

/** What an empty Today says to someone new to it, and what its button does. */
export interface Welcome {
  title: string;
  body: string;
  /** Invite people (a team space you made), or open the writing line. */
  action: 'invite' | 'write';
}

/**
 * Today's welcome, while its day is empty. A team space you made, still just you, offers Invite people. While you are
 * new (Getting started still open), Personal says welcome to Tudu and a space you joined by invite says who is there.
 * Otherwise the day reads plainly.
 */
export function welcomeFor(
  space: Pick<SpaceSummary, 'kind' | 'name' | 'members' | 'joined'>,
  name: string,
  fresh: boolean,
): Welcome | undefined {
  if (space.kind === 'team' && space.members <= 1 && !space.joined)
    return {
      title: `Welcome to ${space.name}.`,
      body: 'It’s just you for now. Invite the people you work with, or write the first thing for the team.',
      action: 'invite',
    };
  if (!fresh) return undefined;
  if (space.kind === 'personal')
    return {
      title: welcomeTitle(name),
      body: 'This is your day: one calm page. Write the first thing you want to get done; it stays here until you cross it off.',
      action: 'write',
    };
  if (space.joined)
    return {
      title: welcomeTitle(name, space.name),
      body: `${peopleHere(space.joined.by, space.members - 1)} What you add in ${space.name} can be shared with them; Personal stays yours.`,
      action: 'write',
    };
  return undefined;
}

/** The month around a day, with a week either side, for the calendar's dots. */
export function monthAround(day: IsoDate): { from: IsoDate; to: IsoDate } {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const first = `${day.slice(0, 7)}-01`;
  const last = `${day.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
  return { from: addDays(first, -7), to: addDays(last, 7) };
}

/**
 * The day page: one plain list on the sheet. Crossed-off tasks stay where they are, struck through; the ring counts
 * them. Write on the last line, slot a task in with the "+", drag to reorder, turn the day with the arrows, the
 * calendar or a swipe. On the desk, "2 days" opens the next day beside it and tasks drag between the two.
 */
export function TodayPage() {
  const vp = useViewport();
  const me = useQuery(meQuery).data;
  const space = useSpace();
  const all = useAllScope();
  const { today, night, start, stay } = useWorkingDay();
  const online = useOnline();
  const day = useShownDay() ?? today;
  const view = useDayView();
  const two = vp === 'desktop' && view === 'two';
  const ask = useNewTaskAsk();
  const fresh = useFirstRunOpen(me);
  const filters = useAllFilters(all);

  // The open task: in the address as its ref ("?task=ME-52"), so a reload and a link reopen it.
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };
  const [open, setOpen] = useState<OpenTask | null>(null);
  const resolving = useRef<string | null>(null);
  // The ref just closed: the address still names it for a moment, and that must not reopen it.
  const closed = useRef<string | null>(null);
  const spaceId = space.id;
  const base = all ? allPath('today') : spacePath(space.slug);
  const filterSlug = all?.filter?.slug ?? null;
  const here = taskHref(base, null, filterSlug);
  const hrefFor = (ref: string | null | undefined) => taskHref(base, ref, filterSlug);
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    // A task named in the address but not open yet (a reload, or a link): ask where it is, then open it there.
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => {
        if (r.day) showDay(r.day, today);
        setOpen({ id: r.taskId, spaceId: r.spaceId, dir: 'next' });
      },
      () => {
        resolving.current = null;
        void navigate({ href: here, replace: true });
      },
    );
  }, [search.task, spaceId, open, today, navigate, here]);
  const openTask = (
    id: string,
    ref: string | null | undefined,
    dir: 'next' | 'prev' = 'next',
    taskSpace?: string,
  ) => {
    setOpen({ id, dir, spaceId: taskSpace ?? taskStore.lastSeen(id)?.spaceId });
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

  const [day2, setDay2] = useState(() => addDays(day, 1));
  const [wasTwo, setWasTwo] = useState(two);
  if (two !== wasTwo) {
    setWasTwo(two);
    if (two) setDay2(addDays(day, 1));
  }
  useEffect(() => {
    setSecondDay(two ? day2 : null);
    return () => setSecondDay(null);
  }, [two, day2]);

  const go = (next: IsoDate) => showDay(next, today);

  // Phones: a sideways swipe turns the day (not while a task is being dragged).
  const touch = useRef<{ x: number; y: number; drag: boolean } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY, drag: false } : null;
  };
  const onTouchMove = () => {
    if (touch.current && document.documentElement.classList.contains('tp-is-dragging'))
      touch.current.drag = true;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!s || !t || s.drag) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(addDays(day, dx < 0 ? 1 : -1));
  };

  // All spaces: which spaces did not load for the day shown (the rest still show), for the banner.
  const shownAll = useAllDay(all, me?.user.id ?? '', day, today);

  if (!me) return null;
  const nightText = night ? nightWords(night.now, night.from, night.to) : null;
  const welcome = all ? undefined : welcomeFor(space, me.user.name, fresh);
  const sheet = (
    <DaySheet
      spaceId={space.id}
      all={all}
      filters={filters}
      meId={me.user.id}
      day={day}
      today={today}
      onDay={go}
      vp={vp}
      ask={ask}
      label={all ? 'The day, every space' : 'The day'}
      group={two ? 'days' : undefined}
      onOpenTask={openTask}
      openKey={open?.id}
      welcome={welcome}
    />
  );
  const openSpace = all
    ? (all.spaces.find((x) => x.id === (open?.spaceId ?? taskStore.lastSeen(open?.id ?? '')?.spaceId)) ??
      all.target)
    : space;
  const panel = (
    <TaskPanel
      spaceId={openSpace.id}
      space={all ? openSpace : undefined}
      open={open}
      today={today}
      vp={vp}
      me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
      onClose={closeTask}
      onStep={(id, dir) => {
        const ref = taskStore.lastSeen(id)?.ref;
        openTask(id, ref, dir);
      }}
      onRef={(ref) => {
        if (search.task !== ref) void navigate({ href: hrefFor(ref), replace: true });
      }}
      linkFor={taskLink}
      backFor={all ? () => 'All spaces' : undefined}
      neighbours={all ? (d) => cachedAll(all, me.user.id, d).map((t) => t.id) : undefined}
      onOpenSpace={all ? (s, ref) => openInSpace(navigate, s, ref, open?.id) : undefined}
    />
  );
  return (
    <div
      className="app-page"
      onTouchStart={vp === 'phone' ? onTouchStart : undefined}
      onTouchMove={vp === 'phone' ? onTouchMove : undefined}
      onTouchEnd={vp === 'phone' ? onTouchEnd : undefined}
    >
      {nightText ? (
        <Banner
          tone="info"
          title={nightText.title}
          actions={[
            { label: nightText.start, primary: true, onClick: start },
            { label: nightText.stay, onClick: stay },
          ]}
          onDismiss={stay}
        >
          {nightText.body}
        </Banner>
      ) : null}
      <OfflineBanner online={online} all={!!all} />
      {all ? (
        <AllBanners all={all} failed={shownAll.error ? [] : shownAll.failed} onRetry={shownAll.refetch} />
      ) : null}
      {vp === 'desktop' ? (
        <Spread open={two}>
          <SpreadPage>{sheet}</SpreadPage>
          <SpreadPage second>
            <DaySheet
              spaceId={space.id}
              all={all}
              filters={filters}
              meId={me.user.id}
              day={day2}
              today={today}
              onDay={setDay2}
              vp={vp}
              label="The second day"
              group="days"
              second
              onOpenTask={openTask}
              openKey={open?.id}
            />
          </SpreadPage>
        </Spread>
      ) : (
        sheet
      )}
      {panel}
    </div>
  );
}

/** Offline: everything still works from the outbox. */
export function OfflineBanner({ online, all }: { online: boolean; all: boolean }) {
  if (online) return null;
  return (
    <Banner tone="warning" title="You’re offline.">
      {all
        ? 'Changes are saved here and sync to each space when you’re back.'
        : 'Changes are saved here and sync when you’re back.'}
    </Banner>
  );
}

/**
 * All spaces' own banners: a space that did not load (its tasks are missing, the rest show), and a space you stopped
 * being in while you looked.
 */
export function AllBanners({
  all,
  failed,
  onRetry,
}: {
  all: AllScope;
  failed: SpaceSummary[];
  onRetry: () => void;
}) {
  const names = failed.map((s) => s.name);
  const list =
    names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return (
    <>
      {all.gone ? (
        <Banner tone="info" title={`You’re no longer in ${all.gone.name}.`} onDismiss={all.dismissGone}>
          Its tasks left this page. Your other spaces are unchanged.
        </Banner>
      ) : null}
      {list ? (
        <Banner
          tone="warning"
          title={`${list} didn’t load.`}
          actions={[{ label: 'Try again', primary: true, onClick: onRetry }]}
        >
          {names.length > 1 ? 'Their tasks aren’t' : 'Its tasks aren’t'} on this page yet. The other spaces
          are up to date.
        </Banner>
      ) : null}
    </>
  );
}

/** The panel's Space line: the task in its own space, on its day (or in its Backlog). */
export function openInSpace(
  navigate: ReturnType<typeof useNavigate>,
  s: SpaceSummary,
  ref: string | null,
  id: string | undefined,
): void {
  const t = id ? taskStore.lastSeen(id) : undefined;
  const view = t && t.day === null ? 'backlog' : 'today';
  void navigate({ href: taskHref(spacePath(s.slug, view), ref) });
}

interface DaySheetProps {
  spaceId: string;
  /** All spaces: the day of every space, gathered; null on a space's own Today. */
  all: AllScope | null;
  filters: ReturnType<typeof useAllFilters>;
  meId: string;
  day: IsoDate;
  today: IsoDate;
  onDay: (day: IsoDate) => void;
  vp: Viewport;
  label: string;
  /** New task asks: each bump opens the writing line. */
  ask?: number;
  group?: string;
  /** The second sheet of the two days. */
  second?: boolean;
  onOpenTask?: (id: string, ref: string | null | undefined, dir?: 'next' | 'prev', spaceId?: string) => void;
  /** The open task's row keeps the selection wash. */
  openKey?: string;
  /** Someone new to this Today: the empty day says welcome (see welcomeFor). */
  welcome?: Welcome;
}

/** One day on its sheet: the header with its arrows, calendar and ring, and the list or its states. */
function DaySheet({
  spaceId,
  all,
  filters,
  meId,
  day,
  today,
  onDay,
  vp,
  label,
  ask,
  group,
  second,
  onOpenTask,
  openKey,
  welcome,
}: DaySheetProps) {
  const compact = vp === 'phone';
  const q = useQuery({ ...taskStore.dayQuery(spaceId, day, today), enabled: !all });
  const gathered = useAllDay(all, meId, day, today);
  const spaceProjects = useQuery({ ...taskStore.projectsQuery(spaceId), enabled: !all }).data ?? [];
  const projectsOf = useAllProjects(all);
  const flash = useFlash();
  const locate = useLocate();
  const range = monthAround(day);
  const spaceMarks = useQuery({ ...taskStore.marksQuery(spaceId, range.from, range.to), enabled: !all }).data;
  const allMarks = useAllMarks(all, range.from, range.to);
  const marks = all ? allMarks : spaceMarks;

  // Turning the day: the page turns towards the day you are heading to; writing and editing start fresh.
  const [shown, setShown] = useState(day);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [writing, setWriting] = useState<number | null>(null);
  if (day !== shown) {
    setShown(day);
    setDir(day > shown ? 'next' : 'prev');
    setWriting(null);
  }
  const [seenAsk, setSeenAsk] = useState(ask);
  if (ask !== seenAsk) {
    setSeenAsk(ask);
    if (ask) setWriting(ask);
  }

  // The arrows turn from the latest day, even when clicked on the outgoing page while it turns away.
  const latest = useRef(day);
  useLayoutEffect(() => {
    latest.current = day;
  });

  const spaceOf = (id: string) => all?.spaces.find((s) => s.id === id);
  const tasks = all ? gathered.tasks : (q.data?.tasks ?? []);
  const items = tasks.map((t) =>
    all ? toItem(t, today, projectsOf(t.spaceId), spaceOf(t.spaceId)) : toItem(t, today, spaceProjects),
  );
  // In All spaces the ring counts what the filters leave (at once; the list follows a beat later).
  const projectName = (t: Task) =>
    t.projectId ? projectsOf(t.spaceId).find((p) => p.id === t.projectId)?.name : undefined;
  const counted = all
    ? tasks.filter(
        (t) =>
          (!filters.space || t.spaceId === filters.space) &&
          (!filters.project || projectName(t) === filters.project),
      )
    : tasks;
  const visible = all
    ? tasks.filter(
        (t) =>
          (!filters.lagSpace || t.spaceId === filters.lagSpace) &&
          (!filters.lagProject || projectName(t) === filters.lagProject),
      )
    : tasks;
  const done = counted.filter((t) => t.done).length;
  const h = dayHeading(day, today);
  const calendar = { today, selected: day, marks: marks ?? {}, onPick: onDay };
  const spaceIdOf = (key: string) => tasks.find((t) => t.id === key)?.spaceId ?? spaceId;
  const order = all ? gathered.order : [];
  const orderFor = (d: IsoDate | null) => (all ? (d === day ? order : cachedOrder(all, meId, d)) : []);
  const pending = all ? gathered.pending : q.isPending;
  const failed = all ? gathered.error : q.isError && !q.data;
  const fetching = all ? gathered.fetching : q.isFetching;
  const filterName = all
    ? filters.lagSpace
      ? (spaceOf(filters.lagSpace)?.name ?? '')
      : (filters.lagProject ?? '')
    : '';

  let body;
  if (pending) body = <TaskListSkeleton rows={5} compact={compact} />;
  else if (failed)
    body = (
      <EmptyState
        tone="error"
        title={all ? 'Your spaces didn’t load.' : 'This day didn’t load.'}
        action="Try again"
        loading={fetching}
        loadingLabel="Trying again"
        onAction={() => (all ? gathered.refetch() : void q.refetch())}
      >
        Check your connection. Nothing you wrote is lost.
      </EmptyState>
    );
  else if (!tasks.length && writing === null && !group && welcome && h.isToday)
    body = (
      <EmptyState
        title={welcome.title}
        action={welcome.action === 'invite' ? 'Invite people' : 'Add a task'}
        onAction={welcome.action === 'invite' ? openMembers : () => setWriting((n) => (n ?? 0) + 1)}
      >
        {welcome.body}
      </EmptyState>
    );
  else if (all && !tasks.length && writing === null && !group)
    body = (
      <EmptyState title={emptyAllWords(h.day, h.isToday)} action="New task" onAction={() => openQuickAdd()}>
        Plan something in any of your spaces and it shows up here, with its space beside it.
      </EmptyState>
    );
  else if (!tasks.length && writing === null && !group)
    body = (
      <EmptyState
        title={h.isToday ? 'Nothing planned for today yet.' : `Nothing planned for ${h.day} yet.`}
        action="Add a task"
        onAction={() => setWriting((n) => (n ?? 0) + 1)}
      >
        Write the first thing you want to get done. It stays on this page until you cross it off.
      </EmptyState>
    );
  else if (all && tasks.length && !visible.length)
    body = second ? (
      <EmptyState title={filteredWords(filterName, h.day, h.isToday)} mark={false} plain>
        Nothing here yet.
      </EmptyState>
    ) : (
      <EmptyState
        title={filteredWords(filterName, h.day, h.isToday)}
        action="Show every space"
        onAction={filters.clearAll}
        mark={false}
        plain
      >
        The rest of the day is one click away.
      </EmptyState>
    );
  else
    body = (
      <TaskList
        linkFor={rowLink}
        onSignal={(t, k) => {
          if (k === 'jira' && t.jira) openInJira(spaceIdOf(t.key), t.jira);
          else if (all) filters.onSignal(t, k);
        }}
        tasks={items}
        label={`Tasks for ${h.day} ${h.date}`}
        compact={compact}
        resetKey={day}
        group={group}
        filter={all ? (filters.lagProject ?? undefined) : undefined}
        filterSpace={all ? filters.lagSpace : undefined}
        flashKey={flash && flash.day === day ? flash.id : undefined}
        locateKey={locate && locate.day === day ? `${locate.id}:${locate.nonce}` : undefined}
        addLabel={all ? writeWords(all.target) : 'Write the next thing…'}
        addKey={writing}
        onAddClose={() => setWriting(null)}
        calendar={calendar}
        onAdd={(text, before) => {
          const at = before ? tasks.findIndex((t) => t.id === before) : undefined;
          if (!all) return taskStore.create(spaceId, day, text, at === -1 ? undefined : at);
          // Written in All spaces: it goes to Personal (or the filtered space), and takes its place here.
          const id = taskStore.create(all.target.id, day, text);
          taskStore.placeInAll(id, day, at === undefined || at === -1 ? order.length : at, order);
          return id;
        }}
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
            ? taskStore.moveInAll(t.key, to, at, orderFor(to))
            : taskStore.place(t.key, to, at)
        }
        onKeepTask={(t) => taskStore.keep(t.key)}
        onDueChange={(t, due) => taskStore.due(t.key, due)}
        onOpenTask={onOpenTask ? (t) => onOpenTask(t.key, t.id, 'next', spaceIdOf(t.key)) : undefined}
        selectedKey={openKey}
        onAddSubtask={(t, title) => taskStore.addSubtask(spaceIdOf(t.key), t.key, title)}
        onRenameSubtask={(t, s, title) => taskStore.renameSubtask(t.key, s.key, title)}
        onToggleSubtask={(t, s, done) => taskStore.crossSubtask(t.key, s.key, done)}
        onReorderSubtask={(t, s, _from, to) => taskStore.placeSubtask(spaceIdOf(t.key), t.key, s.key, to)}
        onDeleteSubtask={(t, s) => taskStore.removeSubtask(t.key, s.key)}
        onRestoreSubtask={(t, s, index) => {
          const was = tasks.find((x) => x.id === t.key)?.subtasks.find((x) => x.id === s.key);
          taskStore.restoreSubtask(
            spaceIdOf(t.key),
            t.key,
            was ?? {
              id: s.key,
              taskId: t.key,
              title: s.title,
              position: 0,
              done: s.done,
              createdAt: '',
              updatedAt: '',
            },
            index,
          );
        }}
      />
    );

  const chips = all && !second ? <FilterChips all={all} filters={filters} projectsOf={projectsOf} /> : null;
  const header = (
    <DayHeader
      eyebrow={h.eyebrow}
      day={h.day}
      date={h.date}
      done={done}
      total={counted.length}
      isToday={h.isToday}
      onPrev={() => onDay(addDays(latest.current, -1))}
      onNext={() => onDay(addDays(latest.current, 1))}
      onToday={() => onDay(today)}
      calendar={calendar}
      compact={compact}
      prevLabel={second ? 'Previous day, second sheet' : undefined}
      nextLabel={second ? 'Next day, second sheet' : undefined}
      pickLabel={second ? 'Pick the second day' : undefined}
    >
      {chips}
    </DayHeader>
  );
  return (
    <Sheet label={label} turnKey={day} turnDir={dir} fill minHeight={MIN_HEIGHT[vp]}>
      {all && !second ? <div className={filters.headerClass}>{header}</div> : header}
      <SheetBody>
        {all ? (
          // A filter turns the list like the Backlog's project filter: the header holds still.
          <Sheet plain as="div" label={label} turnKey={filters.turnKey} turnDir={filters.turnDir}>
            {body}
          </Sheet>
        ) : (
          body
        )}
      </SheetBody>
    </Sheet>
  );
}

/** The chips under an All spaces title: the space a pill narrowed to, and (on Today) the project. */
export function FilterChips({
  all,
  filters,
  projectsOf,
}: {
  all: AllScope;
  filters: ReturnType<typeof useAllFilters>;
  projectsOf?: (spaceId: string) => Project[];
}) {
  const sp = filters.space ? all.spaces.find((s) => s.id === filters.space) : undefined;
  const project = filters.project
    ? all.spaces.flatMap((s) => projectsOf?.(s.id) ?? []).find((p) => p.name === filters.project)
    : undefined;
  if (!sp && !filters.project) return null;
  return (
    <>
      {sp ? (
        <span className={filters.spaceChipClass}>
          <Chip label={sp.name} space={tileOf(sp)} onClear={filters.clearSpace} />
        </span>
      ) : null}
      {filters.project ? (
        <span className={filters.projectChipClass}>
          <Chip label={filters.project} color={project?.color} onClear={filters.clearProject} />
        </span>
      ) : null}
    </>
  );
}

/** A view that arrives with a later chunk. */
export function SoonPage({ title, body }: { title: string; body: string }) {
  return (
    <div className="app-page">
      <Sheet label={title} fill minHeight={560}>
        <SheetBody>
          <EmptyState title={title} mark={false}>
            {body}
          </EmptyState>
        </SheetBody>
      </Sheet>
    </div>
  );
}
