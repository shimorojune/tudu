import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  addDays,
  carriedLabel,
  dayHeading,
  daysInMonth,
  dueLabel,
  nightWords,
  type IsoDate,
  type Project,
  type Task,
  type TaskRefResponse,
} from '@tudu/core';
import {
  Banner,
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
import { setSecondDay, showDay, useDayView, useFlash, useLocate, useNewTaskAsk, useShownDay } from '../../app/dayView';
import { api, meQuery } from '../../app/session';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { TaskPanel, type OpenTask } from './TaskPanel';

/** A swipe this wide (and wider than it is tall) turns the day on phones. */
const SWIPE_PX = 60;

const MIN_HEIGHT: Record<Viewport, number> = { desktop: 560, tablet: 640, phone: 520 };

/** A task as a row: the words of its byline for the day shown. */
export function toItem(t: Task, today: IsoDate, projects: Project[]): TaskItem {
  const project = t.projectId ? projects.find((p) => p.id === t.projectId) : undefined;
  return {
    key: t.id,
    id: t.ref,
    title: t.title,
    done: t.done,
    project: project ? { name: project.name, color: project.color } : undefined,
    due: t.due && !t.done ? dueLabel(t.due, today) : undefined,
    carried: t.carriedFrom && !t.done ? carriedLabel(t.carriedFrom, today) : undefined,
    comments: t.commentCount || undefined,
    subtasks: t.subtasks.map((s) => ({ key: s.id, title: s.title, done: s.done })),
  };
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
  const space = me?.spaces.find((s) => s.kind === 'personal') ?? me?.spaces[0];
  const { today, night, start, stay } = useWorkingDay();
  const online = useOnline();
  const day = useShownDay() ?? today;
  const view = useDayView();
  const two = vp === 'desktop' && view === 'two';
  const ask = useNewTaskAsk();

  // The open task: in the address as its ref ("?task=ME-52"), so a reload and a link reopen it.
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };
  const [open, setOpen] = useState<OpenTask | null>(null);
  const resolving = useRef<string | null>(null);
  // The ref just closed: the address still names it for a moment, and that must not reopen it.
  const closed = useRef<string | null>(null);
  const spaceId = space?.id;
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    // A task named in the address but not open yet (a reload, or a link): ask where it is, then open it there.
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => {
        if (r.day) showDay(r.day, today);
        setOpen({ id: r.taskId, dir: 'next' });
      },
      () => {
        resolving.current = null;
        void navigate({ to: '/', search: {}, replace: true });
      },
    );
  }, [search.task, spaceId, open, today, navigate]);
  const openTask = (id: string, ref: string | null | undefined, dir: 'next' | 'prev' = 'next') => {
    setOpen({ id, dir });
    closed.current = null;
    if (ref) resolving.current = ref;
    void navigate({ to: '/', search: ref ? { task: ref } : {}, replace: true });
  };
  const closeTask = () => {
    setOpen(null);
    closed.current = search.task ?? null;
    resolving.current = null;
    if (search.task) void navigate({ to: '/', search: {}, replace: true });
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

  if (!space || !me) return null;
  const nightText = night ? nightWords(night.now, night.from, night.to) : null;
  const sheet = (
    <DaySheet
      spaceId={space.id}
      day={day}
      today={today}
      onDay={go}
      vp={vp}
      ask={ask}
      label="The day"
      group={two ? 'days' : undefined}
      onOpenTask={openTask}
      openKey={open?.id}
    />
  );
  const panel = (
    <TaskPanel
      spaceId={space.id}
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
        if (search.task !== ref) void navigate({ to: '/', search: { task: ref }, replace: true });
      }}
      linkFor={(ref) => `${window.location.origin}/t/${ref}`}
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
      {!online ? (
        <Banner tone="warning" title="You’re offline.">
          Changes are saved here and sync when you’re back.
        </Banner>
      ) : null}
      {vp === 'desktop' ? (
        <Spread open={two}>
          <SpreadPage>{sheet}</SpreadPage>
          <SpreadPage second>
            <DaySheet
              spaceId={space.id}
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

interface DaySheetProps {
  spaceId: string;
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
  onOpenTask?: (id: string, ref: string | null | undefined) => void;
  /** The open task's row keeps the selection wash. */
  openKey?: string;
}

/** One day on its sheet: the header with its arrows, calendar and ring, and the list or its states. */
function DaySheet({
  spaceId,
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
}: DaySheetProps) {
  const compact = vp === 'phone';
  const q = useQuery(taskStore.dayQuery(spaceId, day, today));
  const projects = useQuery(taskStore.projectsQuery(spaceId)).data ?? [];
  const flash = useFlash();
  const locate = useLocate();
  const range = monthAround(day);
  const marks = useQuery(taskStore.marksQuery(spaceId, range.from, range.to)).data;

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

  const tasks = q.data?.tasks ?? [];
  const items = tasks.map((t) => toItem(t, today, projects));
  const done = tasks.filter((t) => t.done).length;
  const h = dayHeading(day, today);
  const calendar = { today, selected: day, marks: marks ?? {}, onPick: onDay };

  let body;
  if (q.isPending) body = <TaskListSkeleton rows={5} compact={compact} />;
  else if (q.isError && !q.data)
    body = (
      <EmptyState
        tone="error"
        title="This day didn’t load."
        action="Try again"
        loading={q.isFetching}
        loadingLabel="Trying again"
        onAction={() => void q.refetch()}
      >
        Check your connection. Nothing you wrote is lost.
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
  else
    body = (
      <TaskList
        tasks={items}
        label={`Tasks for ${h.day} ${h.date}`}
        compact={compact}
        resetKey={day}
        group={group}
        flashKey={flash && flash.day === day ? flash.id : undefined}
        locateKey={locate && locate.day === day ? `${locate.id}:${locate.nonce}` : undefined}
        addLabel="Write the next thing…"
        addKey={writing}
        onAddClose={() => setWriting(null)}
        calendar={calendar}
        onAdd={(text, before) => {
          const at = before ? tasks.findIndex((t) => t.id === before) : undefined;
          return taskStore.create(spaceId, day, text, at === -1 ? undefined : at);
        }}
        onToggleTask={(t, v) => taskStore.cross(t.key, v)}
        onReorder={(_, moved) => taskStore.place(moved.key, day, moved.to)}
        onReceive={(key, at) => taskStore.place(key, day, at)}
        onMoveTask={(t, to, _from, at) => taskStore.place(t.key, to, at)}
        onKeepTask={(t) => taskStore.keep(t.key)}
        onDueChange={(t, due) => taskStore.due(t.key, due)}
        onOpenTask={onOpenTask ? (t) => onOpenTask(t.key, t.id) : undefined}
        selectedKey={openKey}
        onAddSubtask={(t, title) => taskStore.addSubtask(spaceId, t.key, title)}
        onRenameSubtask={(t, s, title) => taskStore.renameSubtask(t.key, s.key, title)}
        onToggleSubtask={(t, s, done) => taskStore.crossSubtask(t.key, s.key, done)}
        onReorderSubtask={(t, s, _from, to) => taskStore.placeSubtask(spaceId, t.key, s.key, to)}
        onDeleteSubtask={(t, s) => taskStore.removeSubtask(t.key, s.key)}
        onRestoreSubtask={(t, s, index) => {
          const was = tasks.find((x) => x.id === t.key)?.subtasks.find((x) => x.id === s.key);
          taskStore.restoreSubtask(
            spaceId,
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

  return (
    <Sheet label={label} turnKey={day} turnDir={dir} fill minHeight={MIN_HEIGHT[vp]}>
      <DayHeader
        eyebrow={h.eyebrow}
        day={h.day}
        date={h.date}
        done={done}
        total={tasks.length}
        isToday={h.isToday}
        onPrev={() => onDay(addDays(latest.current, -1))}
        onNext={() => onDay(addDays(latest.current, 1))}
        onToday={() => onDay(today)}
        calendar={calendar}
        compact={compact}
        prevLabel={second ? 'Previous day, second sheet' : undefined}
        nextLabel={second ? 'Next day, second sheet' : undefined}
        pickLabel={second ? 'Pick the second day' : undefined}
      />
      <SheetBody>{body}</SheetBody>
    </Sheet>
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
