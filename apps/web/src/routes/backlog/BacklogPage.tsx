import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import {
  addDays,
  backlogCount,
  countByProject,
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
  ProjectFilter,
  Segmented,
  Sheet,
  SpaceFilter,
  SheetBody,
  TaskList,
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
  taskHref,
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
import { editProjects, editProjectsHref } from '../../app/editProjects';
import { useWorkingDay } from '../../app/workingDay';
import { AllBanners, OfflineBanner, monthAround, openInSpace, toItem } from '../today/TodayPage';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import { setBacklogFilter, useBacklogFilter } from './filter';
import { taskLink, rowLink } from '../../app/links';

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
  const filterSlug = all?.filter?.slug ?? null;
  const here = taskHref(base, null, filterSlug);
  const hrefFor = (ref: string | null | undefined) => taskHref(base, ref, filterSlug);
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => setOpen({ id: r.taskId, spaceId: r.spaceId, dir: 'next' }),
      () => {
        resolving.current = null;
        void navigate({ href: here, replace: true });
      },
    );
  }, [search.task, spaceId, open, navigate, here]);
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
}

/** The sheet: the header with the filter and the view switch, then the list for the view or its states. */
function BacklogSheet({ all, filters, meId, spaceId, today, vp, onOpenTask, openKey }: BacklogSheetProps) {
  const space = useSpace();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
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
  const kept = useBacklogFilter(spaceId);
  // All spaces narrows by space, never by a project (each space has its own).
  const filterProject = kept && !all ? projects.find((p) => p.id === kept) : undefined;
  const projectsReady = spaceProjects.isSuccess;
  useEffect(() => {
    if (kept && projectsReady && !filterProject && !all) setBacklogFilter(spaceId, null);
  }, [kept, projectsReady, filterProject, spaceId, all]);
  const filter = filterProject?.name;
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
  const shown = filterProject
    ? inView.filter((t) => t.projectId === filterProject.id)
    : all && filters.space
      ? inView.filter((t) => t.spaceId === filters.space)
      : inView;
  const listed = narrowedTo ? inView.filter((t) => t.spaceId === narrowedTo) : inView;
  const counts = countByProject(inView);
  const items = inView.map((t) =>
    all ? toItem(t, today, projectsOf(t.spaceId), spaceOf(t.spaceId)) : toItem(t, today, projects),
  );
  const filterSpace = all?.filter ?? null;
  const count = q.data
    ? all
      ? allBacklogCount(shown.length, view, filterSpace?.name ?? null)
      : backlogCount(shown.length, view, filterProject?.name)
    : '';
  const calendar = { today, marks };
  const turnTo = (v: BacklogView) => {
    setDir(v === 'done' ? 'next' : 'prev');
    setView(v);
  };
  const spaceIdOf = (key: string) => tasks.find((t) => t.id === key)?.spaceId ?? spaceId;
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
  if (q.isPending) body = <TaskListSkeleton rows={5} compact={compact} />;
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
  else if (filterProject && !shown.length)
    body = (
      <EmptyState
        title="Nothing here for this project."
        action="Show all projects"
        plain
        mark={false}
        onAction={() => setBacklogFilter(spaceId, null)}
      >
        The rest of the Backlog is one click away.
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
  else if (view === 'done')
    body = (
      <TaskList
        linkFor={rowLink}
        onSignal={onSignal}
        tasks={items}
        label="Crossed off in the Backlog"
        compact={compact}
        static
        resetKey="done"
        filter={filter}
        filterSpace={narrowedTo}
        leaveUndone
        unleaveToast="Back in the Backlog"
        onLeave={(t) => taskStore.cross(t.key, false)}
        onUnleave={(t) => taskStore.cross(t.key, true)}
        onOpenTask={(t) => onOpenTask(t.key, t.id)}
        selectedKey={openKey}
        locateKey={locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined}
      />
    );
  else
    body = (
      <TaskList
        linkFor={rowLink}
        onSignal={onSignal}
        tasks={items}
        label="Tasks in the Backlog"
        compact={compact}
        resetKey="open"
        filter={filter}
        filterSpace={narrowedTo}
        undated
        planButton
        leaveDone
        calendar={calendar}
        flashKey={flash && flash.day === null ? flash.id : undefined}
        addLabel={target ? `Add to ${target.name}’s Backlog…` : 'Add to the Backlog…'}
        addKey={writing}
        onAddClose={() => setWriting(null)}
        onAdd={(text, before) => {
          const at = before ? open.findIndex((t) => t.id === before) : undefined;
          if (!target) return taskStore.create(spaceId, null, text, at === -1 ? undefined : at);
          // In All spaces: into Personal's (or the filtered space's) Backlog, in its place here.
          const id = taskStore.create(target.id, null, text);
          const k = before ? order.findIndex((x) => x.id === before) : -1;
          taskStore.placeInAll(id, null, k === -1 ? order.length : k, order);
          return id;
        }}
        onLeave={(t) => taskStore.cross(t.key, true)}
        onUnleave={(t) => taskStore.cross(t.key, false)}
        onReorder={(_, moved) => {
          if (!all) return taskStore.place(moved.key, null, moved.to);
          // The list is To do only; All spaces' order is of the whole Backlog, so slot it by its neighbour.
          const next = open.filter((t) => t.id !== moved.key)[moved.to];
          const rest = order.filter((x) => x.id !== moved.key);
          const k = next ? rest.findIndex((x) => x.id === next.id) : -1;
          taskStore.placeInAll(moved.key, null, k === -1 ? rest.length : k, order);
        }}
        onMoveTask={(t, to, _from, at) =>
          all && at !== undefined && to === null
            ? taskStore.moveInAll(t.key, to, at, order)
            : taskStore.place(t.key, to, at)
        }
        onDueChange={(t, due) => taskStore.due(t.key, due)}
        onOpenTask={(t) => onOpenTask(t.key, t.id)}
        selectedKey={openKey}
        locateKey={locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined}
        onAddSubtask={(t, title) => taskStore.addSubtask(spaceIdOf(t.key), t.key, title)}
        onRenameSubtask={(t, s, title) => taskStore.renameSubtask(t.key, s.key, title)}
        onToggleSubtask={(t, s, v) => taskStore.crossSubtask(t.key, s.key, v)}
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
        {all ? null : (
          <ProjectFilter
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              count: counts[p.id] ?? 0,
            }))}
            total={inView.length}
            value={filterProject?.id ?? null}
            onChange={(id) => setBacklogFilter(spaceId, id)}
            onEdit={() =>
              editProjects(
                (href) => void navigate({ href }),
                editProjectsHref(
                  space.slug,
                  { slug: space.slug, pathname: loc.pathname, searchStr: loc.searchStr },
                  vp === 'phone',
                ),
              )
            }
          />
        )}
        <Segmented items={VIEWS} value={view} onChange={turnTo} label="View" />
      </DayHeader>
      <SheetBody>
        <Sheet
          plain
          as="div"
          label={view === 'open' ? 'To do' : 'Crossed off'}
          turnKey={all ? `${view}:${narrowedTo ?? ''}` : view}
          turnDir={dir}
        >
          {body}
        </Sheet>
      </SheetBody>
    </Sheet>
  );
}
