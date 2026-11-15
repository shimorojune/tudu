import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  addDays,
  backlogCount,
  splitBacklog,
  spaceInitials,
  type BacklogView,
  type IsoDate,
  type Task,
  type TaskRefResponse,
} from '@tudu/core';
import {
  DayHeader,
  EmptyState,
  Segmented,
  Sheet,
  SpaceFilter,
  SheetBody,
  TaskGroups,
  TaskList,
  type TaskItem,
  TaskListSkeleton,
} from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import {
  openQuickAdd,
  setPage,
  useBacklogViewAsk,
  useFlash,
  useLocate,
  useNewTaskAsk,
} from '../../app/dayView';
import { api, meQuery } from '../../app/session';
import {
  allBacklogCount,
  cachedAll,
  useTaskHref,
  useAllBacklog,
  useAllFilters,
  useAllMarks,
  useAllProjects,
  useAllScope,
  type AllScope,
} from '../../app/allSpaces';
import { allPath, spacePath, useSpace } from '../../app/space';
import { openInJira } from '../../app/jira';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { AllBanners, OfflineBanner, monthAround, openInSpace, toItem } from '../today/TodayPage';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import { useProjectGroups } from '../../app/grouped';
import { taskLink, rowLink } from '../../app/links';
import { useRowMenu } from '../../app/rowMenu';

const MIN_HEIGHT: Record<Viewport, number> = { desktop: 560, tablet: 640, phone: 520 };
const VIEWS: Array<{ value: BacklogView; label: string }> = [
  { value: 'open', label: 'To do' },
  { value: 'done', label: 'Crossed off' },
];

/**
 * The Backlog: one sheet like Today for the tasks with no day. "Backlog" and the count, the project filter on the
 * left and To do | Crossed off on the right, then the list in your own order. The quiet calendar button at a row's
 * end gives it a day; crossing one off folds it away to Crossed off, with Undo. Reads the same cache the week's
 * Backlog tile and the panel use.
 */
export function BacklogPage() {
  const vp = useViewport();
  const me = useQuery(meQuery).data;
  const space = useSpace();
  const all = useAllScope();
  const filters = useAllFilters(all);
  const { today } = useWorkingDay();
  const online = useOnline();
  useEffect(() => {
    setPage('backlog');
    return () => setPage(null);
  }, []);

  // The open task: in the address as its ref ("/backlog?task=ME-52"), so a reload and a link reopen it.
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { task?: string };
  const [open, setOpen] = useState<OpenTask | null>(null);
  const resolving = useRef<string | null>(null);
  const closed = useRef<string | null>(null);
  const spaceId = space.id;
  const base = all ? allPath('backlog') : spacePath(space.slug, 'backlog');
  const hrefFor = useTaskHref(base, !!all);
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => setOpen({ id: r.taskId, spaceId: r.spaceId, dir: 'next' }),
      () => {
        resolving.current = null;
        void navigate({ href: hrefFor(null), replace: true });
      },
    );
  }, [search.task, spaceId, open, navigate, hrefFor]);
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
    if (search.task) void navigate({ href: hrefFor(null), replace: true });
  };

  const gathered = useAllBacklog(all, me?.user.id ?? '', today);
  if (!me) return null;
  const openSpace = all
    ? (all.spaces.find((x) => x.id === (open?.spaceId ?? taskStore.lastSeen(open?.id ?? '')?.spaceId)) ??
      all.target)
    : space;
  return (
    <div className="app-page app-backlog">
      <OfflineBanner online={online} all={!!all} />
      {all ? (
        <AllBanners all={all} failed={gathered.error ? [] : gathered.failed} onRetry={gathered.refetch} />
      ) : null}
      <BacklogSheet
        all={all}
        filters={filters}
        meId={me.user.id}
        spaceId={space.id}
        today={today}
        vp={vp}
        onOpenTask={openTask}
        openKey={open?.id}
        onCloseTask={closeTask}
      />
      <TaskPanel
        spaceId={openSpace.id}
        space={all ? openSpace : undefined}
        neighbours={all ? (d) => cachedAll(all, me.user.id, d).map((t) => t.id) : undefined}
        onOpenSpace={all ? (s, ref) => openInSpace(navigate, s, ref, open?.id) : undefined}
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
        backFor={() => 'Backlog'}
      />
    </div>
  );
}

interface BacklogSheetProps {
  /** All spaces: every space's Backlog, gathered; null on a space's own Backlog. */
  all: AllScope | null;
  filters: ReturnType<typeof useAllFilters>;
  meId: string;
  spaceId: string;
  today: IsoDate;
  vp: Viewport;
  onOpenTask: (id: string, ref: string | null | undefined) => void;
  openKey?: string;
  /** Close the panel (its task was deleted from the row menu). */
  onCloseTask?: () => void;
}

/** The sheet: the header with the filter and the view switch, then the list for the view or its states. */
function BacklogSheet({
  all,
  filters,
  meId,
  spaceId,
  today,
  vp,
  onOpenTask,
  openKey,
  onCloseTask,
}: BacklogSheetProps) {
  const compact = vp === 'phone';
  const single = useQuery({ ...taskStore.backlogQuery(spaceId), enabled: !all });
  const gathered = useAllBacklog(all, meId, today);
  const q = all
    ? {
        data: gathered.pending ? undefined : { tasks: gathered.tasks },
        isPending: gathered.pending,
        isError: gathered.error,
        isFetching: gathered.fetching,
        refetch: async () => gathered.refetch(),
      }
    : single;
  const spaceProjects = useQuery({ ...taskStore.projectsQuery(spaceId), enabled: !all });
  const projects = all ? [] : (spaceProjects.data ?? []);
  const projectsOf = useAllProjects(all);
  const range = monthAround(today);
  const spaceMarks =
    useQuery({ ...taskStore.marksQuery(spaceId, addDays(range.from, -7), range.to), enabled: !all }).data ??
    {};
  const allMarks = useAllMarks(all, addDays(range.from, -7), range.to);
  const marks = all ? allMarks : spaceMarks;
  const flash = useFlash();
  const locate = useLocate();
  const ask = useNewTaskAsk();

  // The view starts at To do each visit; the filter is remembered. A filter for a project that is gone is dropped.
  // A task picked in Search asks for its view (Crossed off for a crossed-off one).
  const viewAsk = useBacklogViewAsk();
  const [view, setView] = useState<BacklogView>(viewAsk?.view ?? 'open');
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [seenViewAsk, setSeenViewAsk] = useState(viewAsk?.nonce ?? 0);
  if (viewAsk && viewAsk.nonce !== seenViewAsk) {
    setSeenViewAsk(viewAsk.nonce);
    if (viewAsk.view !== view) {
      setDir(viewAsk.view === 'done' ? 'next' : 'prev');
      setView(viewAsk.view);
    }
  }
  const [writing, setWriting] = useState<number | null>(null);
  const [seenAsk, setSeenAsk] = useState(ask);
  if (ask !== seenAsk) {
    setSeenAsk(ask);
    if (ask) setWriting(ask);
  }

  const tasks = q.data?.tasks ?? [];
  const { open, done } = splitBacklog(tasks);
  const inView = view === 'open' ? open : done;
  const spaceOf = (id: string) => all?.spaces.find((s) => s.id === id);
  const narrowedTo = all ? filters.lagSpace : null;
  const shown = all && filters.space ? inView.filter((t) => t.spaceId === filters.space) : inView;
  const listed = narrowedTo ? inView.filter((t) => t.spaceId === narrowedTo) : inView;
  const items = inView.map((t) =>
    all ? toItem(t, today, projectsOf(t.spaceId), spaceOf(t.spaceId)) : toItem(t, today, projects),
  );
  const filterSpace = all?.filter ?? null;
  // By project (see grouped.tsx): the same switch and the same folds as the day pages. It replaced the project menu.
  const g = useProjectGroups({
    spaceId,
    tasks: listed,
    items,
    projects: all ? all.spaces.flatMap((s) => projectsOf(s.id)) : projects,
    ready: spaceProjects.isSuccess,
    spaces: all ? all.spaces.map((s) => s.id) : null,
    className: 'tp-seg-lead',
  });
  const count = q.data
    ? all
      ? allBacklogCount(shown.length, view, filterSpace?.name ?? null)
      : backlogCount(shown.length, view)
    : '';
  const calendar = { today, marks };
  const turnTo = (v: BacklogView) => {
    setDir(v === 'done' ? 'next' : 'prev');
    setView(v);
  };
  const spaceIdOf = (key: string) => tasks.find((t) => t.id === key)?.spaceId ?? spaceId;
  const rowMenu = useRowMenu({
    spaceIds: all ? all.spaces.map((x) => x.id) : [spaceId],
    spaceIdOf,
    meId,
    openKey,
    onCloseTask,
  });
  const order = all ? gathered.order : [];
  const target = all?.target;
  // All spaces' space filter: the list turns towards the space further down the switcher.
  const pickSpace = (id: string | null) => {
    if (!all || id === filters.space) return;
    const at = (x: string | null) => (x ? all.spaces.findIndex((s) => s.id === x) : -1);
    setDir(at(id) > at(filters.space) ? 'next' : 'prev');
    all.setFilter(id);
  };
  const onSignal = (t: { key: string; jira?: string; inSpace?: { id: string } }, k: string) => {
    if (k === 'jira' && t.jira) openInJira(spaceIdOf(t.key), t.jira);
    else if (all && k === 'space' && t.inSpace)
      pickSpace(filters.space === t.inSpace.id ? null : t.inSpace.id);
  };
  void (null as unknown as Task);

  let body;
  if (q.isPending) body = <TaskListSkeleton rows={5} compact={compact} grouped={g.wanted} />;
  else if (q.isError && !q.data)
    body = (
      <EmptyState
        tone="error"
        title={all ? 'Your spaces didn’t load.' : 'Couldn’t load the Backlog.'}
        action="Try again"
        loading={q.isFetching}
        loadingLabel="Trying again"
        onAction={() => void q.refetch()}
      >
        Check your connection. Offline, the Backlog shows what was last loaded.
      </EmptyState>
    );
  else if (all && filters.lagSpace && inView.length && !listed.length)
    body = (
      <EmptyState
        title={`Nothing in ${spaceOf(filters.lagSpace)?.name ?? ''}’s Backlog.`}
        action="Show every space"
        plain
        mark={false}
        onAction={() => pickSpace(null)}
      >
        The rest of the Backlog is one click away.
      </EmptyState>
    );
  else if (view === 'done' && !done.length)
    body = (
      <EmptyState title="Nothing crossed off yet." mark={false}>
        Tasks you cross off in the Backlog wait here. Untick one to bring it back.
      </EmptyState>
    );
  else if (view === 'open' && !open.length && writing === null && all)
    body = (
      <EmptyState title="Nothing waiting, in any space." action="New task" onAction={() => openQuickAdd()}>
        Tasks without a day land here, from every space. Give one a day with its calendar button when you’re
        ready.
      </EmptyState>
    );
  else if (view === 'open' && !open.length && writing === null)
    body = (
      <EmptyState title="Nothing waiting." action="Add a task" onAction={() => openQuickAdd()}>
        Tasks without a day land here. Give one a day with its calendar button when you’re ready.
      </EmptyState>
    );
  else if (view === 'done') {
    const rows = {
      menu: rowMenu,
      linkFor: rowLink,
      onSignal,
      compact,
      static: true,
      resetKey: 'done',
      leaveUndone: true,
      unleaveToast: 'Back in the Backlog',
      onLeave: (t: TaskItem) => taskStore.cross(t.key, false),
      onUnleave: (t: TaskItem) => taskStore.cross(t.key, true),
      onOpenTask: (t: TaskItem) => onOpenTask(t.key, t.id),
      selectedKey: openKey,
      locateKey: locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined,
    };
    body = g.on ? (
      <TaskGroups {...rows} groups={g.groups} folded={g.folded} onFold={g.fold} />
    ) : (
      <TaskList {...rows} tasks={items} label="Crossed off in the Backlog" filterSpace={narrowedTo} />
    );
  } else {
    const rows = {
      menu: rowMenu,
      linkFor: rowLink,
      onSignal,
      compact,
      resetKey: 'open',
      undated: true,
      planButton: true,
      leaveDone: true,
      calendar,
      flashKey: flash && flash.day === null ? flash.id : undefined,
      addLabel: target ? `Add to ${target.name}’s Backlog…` : 'Add to the Backlog…',
      addKey: writing,
      onAddClose: () => setWriting(null),
      onLeave: (t: TaskItem) => taskStore.cross(t.key, true),
      onUnleave: (t: TaskItem) => taskStore.cross(t.key, false),
      onMoveTask: (t: TaskItem, to: IsoDate | null, _from: IsoDate | null, at?: number) =>
        all && at !== undefined && to === null
          ? taskStore.moveInAll(t.key, to, at, order)
          : taskStore.place(t.key, to, at),
      onDueChange: (t: TaskItem, due: IsoDate | null) => taskStore.due(t.key, due),
      onOpenTask: (t: TaskItem) => onOpenTask(t.key, t.id),
      selectedKey: openKey,
      locateKey: locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined,
      onAddSubtask: (t: TaskItem, title: string) => taskStore.addSubtask(spaceIdOf(t.key), t.key, title),
      onRenameSubtask: (t: TaskItem, s: { key: string }, title: string) =>
        taskStore.renameSubtask(t.key, s.key, title),
      onToggleSubtask: (t: TaskItem, s: { key: string }, v: boolean) =>
        taskStore.crossSubtask(t.key, s.key, v),
      onReorderSubtask: (t: TaskItem, s: { key: string }, _from: number, to: number) =>
        taskStore.placeSubtask(spaceIdOf(t.key), t.key, s.key, to),
      onDeleteSubtask: (t: TaskItem, s: { key: string }) => taskStore.removeSubtask(t.key, s.key),
      onRestoreSubtask: (t: TaskItem, s: { key: string; title: string; done?: boolean }, index: number) => {
        const was = tasks.find((x) => x.id === t.key)?.subtasks.find((x) => x.id === s.key);
        taskStore.restoreSubtask(
          spaceIdOf(t.key),
          t.key,
          was ?? {
            id: s.key,
            taskId: t.key,
            title: s.title,
            position: 0,
            done: !!s.done,
            createdAt: '',
            updatedAt: '',
          },
          index,
        );
      },
    };
    const openIds = open.map((t) => t.id);
    const allIds = order.map((x) => x.id);
    body = g.on ? (
      <TaskGroups
        {...rows}
        groups={g.groups}
        folded={g.folded}
        onFold={g.fold}
        onAdd={(text, group, before) => {
          const to = g.target(group);
          const extra = to.projectId ? { projectId: to.projectId } : {};
          // On a project's own line it goes right after the project's last task, so My order keeps them together.
          const slot = (list: string[]) =>
            before ? list.indexOf(before) : to.projectId ? g.end(list, group) : -1;
          if (!all) {
            const at = slot(openIds);
            return taskStore.create(spaceId, null, text, at === -1 ? undefined : at, extra);
          }
          const id = taskStore.create(to.spaceId ?? all.target.id, null, text, undefined, extra);
          const k = slot(allIds);
          taskStore.placeInAll(id, null, k === -1 ? order.length : k, order);
          return id;
        }}
        onReorder={(group, moved) => {
          if (all) taskStore.placeInAll(moved.key, null, g.place(allIds, group, moved.key, moved.to), order);
          else taskStore.place(moved.key, null, g.place(openIds, group, moved.key, moved.to));
        }}
      />
    ) : (
      <TaskList
        {...rows}
        tasks={items}
        label="Tasks in the Backlog"
        filterSpace={narrowedTo}
        onAdd={(text, before) => {
          const at = before ? open.findIndex((t) => t.id === before) : undefined;
          if (!target) return taskStore.create(spaceId, null, text, at === -1 ? undefined : at);
          // In All spaces: into Personal's (or the filtered space's) Backlog, in its place here.
          const id = taskStore.create(target.id, null, text);
          const k = before ? order.findIndex((x) => x.id === before) : -1;
          taskStore.placeInAll(id, null, k === -1 ? order.length : k, order);
          return id;
        }}
        onReorder={(_, moved) => {
          if (!all) return taskStore.place(moved.key, null, moved.to);
          // The list is To do only; All spaces' order is of the whole Backlog, so slot it by its neighbour.
          const next = open.filter((t) => t.id !== moved.key)[moved.to];
          const rest = order.filter((x) => x.id !== moved.key);
          const k = next ? rest.findIndex((x) => x.id === next.id) : -1;
          taskStore.placeInAll(moved.key, null, k === -1 ? rest.length : k, order);
        }}
      />
    );
  }

  return (
    <Sheet label={all ? 'The Backlog, every space' : 'The Backlog'} fill minHeight={MIN_HEIGHT[vp]}>
      <DayHeader day="Backlog" date={count} nav={false} compact={compact}>
        {all ? (
          <SpaceFilter
            allTile
            spaces={all.spaces.map((s) => ({
              id: s.id,
              name: s.name,
              color: s.color,
              initials: spaceInitials(s.name),
              personal: s.kind === 'personal',
              count: open.filter((t) => t.spaceId === s.id).length,
            }))}
            total={open.length}
            value={filters.space}
            onChange={pickSpace}
          />
        ) : null}
        {q.isPending || (q.isError && !q.data) ? null : g.control}
        <Segmented items={VIEWS} value={view} onChange={turnTo} label="View" />
      </DayHeader>
      <SheetBody>
        <Sheet
          plain
          as="div"
          label={view === 'open' ? 'To do' : 'Crossed off'}
          turnKey={all ? `${view}:${narrowedTo ?? ''}:${g.view}` : `${view}:${g.view}`}
          turnDir={dir}
        >
          {body}
        </Sheet>
      </SheetBody>
    </Sheet>
  );
}
