import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import {
  addDays,
  backlogCount,
  countByProject,
  splitBacklog,
  type BacklogView,
  type IsoDate,
  type TaskRefResponse,
} from '@tudu/core';
import {
  Banner,
  DayHeader,
  EmptyState,
  ProjectFilter,
  Segmented,
  Sheet,
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
import { spacePath, useSpace } from '../../app/space';
import { openInJira } from '../../app/jira';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { editProjects, editProjectsHref } from '../../app/editProjects';
import { useWorkingDay } from '../../app/workingDay';
import { monthAround, toItem } from '../today/TodayPage';
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
  const here = spacePath(space.slug, 'backlog');
  useEffect(() => {
    const ref = search.task;
    if (!ref || !spaceId || open || resolving.current === ref || closed.current === ref) return;
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => setOpen({ id: r.taskId, dir: 'next' }),
      () => {
        resolving.current = null;
        void navigate({ href: here, replace: true });
      },
    );
  }, [search.task, spaceId, open, navigate, here]);
  const openTask = (id: string, ref: string | null | undefined, dir: 'next' | 'prev' = 'next') => {
    setOpen({ id, dir });
    closed.current = null;
    if (ref) resolving.current = ref;
    void navigate({ href: ref ? `${here}?task=${encodeURIComponent(ref)}` : here, replace: true });
  };
  const closeTask = () => {
    setOpen(null);
    closed.current = search.task ?? null;
    resolving.current = null;
    if (search.task) void navigate({ href: here, replace: true });
  };

  if (!me) return null;
  return (
    <div className="app-page app-backlog">
      {!online ? (
        <Banner tone="warning" title="You’re offline.">
          Changes are saved here and sync when you’re back.
        </Banner>
      ) : null}
      <BacklogSheet spaceId={space.id} today={today} vp={vp} onOpenTask={openTask} openKey={open?.id} />
      <TaskPanel
        spaceId={space.id}
        open={open}
        today={today}
        vp={vp}
        me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
        onClose={closeTask}
        onStep={(id, dir) => openTask(id, taskStore.lastSeen(id)?.ref, dir)}
        onRef={(ref) => {
          if (search.task !== ref)
            void navigate({ href: `${here}?task=${encodeURIComponent(ref)}`, replace: true });
        }}
        linkFor={taskLink}
        backFor={() => 'Backlog'}
      />
    </div>
  );
}

interface BacklogSheetProps {
  spaceId: string;
  today: IsoDate;
  vp: Viewport;
  onOpenTask: (id: string, ref: string | null | undefined) => void;
  openKey?: string;
}

/** The sheet: the header with the filter and the view switch, then the list for the view or its states. */
function BacklogSheet({ spaceId, today, vp, onOpenTask, openKey }: BacklogSheetProps) {
  const space = useSpace();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const compact = vp === 'phone';
  const q = useQuery(taskStore.backlogQuery(spaceId));
  const projects = useQuery(taskStore.projectsQuery(spaceId)).data ?? [];
  const range = monthAround(today);
  const marks = useQuery(taskStore.marksQuery(spaceId, addDays(range.from, -7), range.to)).data ?? {};
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
  const filterProject = kept ? projects.find((p) => p.id === kept) : undefined;
  const projectsReady = useQuery(taskStore.projectsQuery(spaceId)).isSuccess;
  useEffect(() => {
    if (kept && projectsReady && !filterProject) setBacklogFilter(spaceId, null);
  }, [kept, projectsReady, filterProject, spaceId]);
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
  const shown = filterProject ? inView.filter((t) => t.projectId === filterProject.id) : inView;
  const counts = countByProject(inView);
  const items = inView.map((t) => toItem(t, today, projects));
  const count = q.data ? backlogCount(shown.length, view, filterProject?.name) : '';
  const calendar = { today, marks };
  const turnTo = (v: BacklogView) => {
    setDir(v === 'done' ? 'next' : 'prev');
    setView(v);
  };

  let body;
  if (q.isPending) body = <TaskListSkeleton rows={5} compact={compact} />;
  else if (q.isError && !q.data)
    body = (
      <EmptyState
        tone="error"
        title="Couldn’t load the Backlog."
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
  else if (view === 'done' && !done.length)
    body = (
      <EmptyState title="Nothing crossed off yet." mark={false}>
        Tasks you cross off in the Backlog wait here. Untick one to bring it back.
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
        onSignal={(t, k) => {
          if (k === 'jira' && t.jira) openInJira(spaceId, t.jira);
        }}
        tasks={items}
        label="Crossed off in the Backlog"
        compact={compact}
        static
        resetKey="done"
        filter={filter}
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
        onSignal={(t, k) => {
          if (k === 'jira' && t.jira) openInJira(spaceId, t.jira);
        }}
        tasks={items}
        label="Tasks in the Backlog"
        compact={compact}
        resetKey="open"
        filter={filter}
        undated
        planButton
        leaveDone
        calendar={calendar}
        flashKey={flash && flash.day === null ? flash.id : undefined}
        addLabel="Add to the Backlog…"
        addKey={writing}
        onAddClose={() => setWriting(null)}
        onAdd={(text, before) => {
          const at = before ? open.findIndex((t) => t.id === before) : undefined;
          return taskStore.create(spaceId, null, text, at === -1 ? undefined : at);
        }}
        onLeave={(t) => taskStore.cross(t.key, true)}
        onUnleave={(t) => taskStore.cross(t.key, false)}
        onReorder={(_, moved) => taskStore.place(moved.key, null, moved.to)}
        onMoveTask={(t, to, _from, at) => taskStore.place(t.key, to, at)}
        onDueChange={(t, due) => taskStore.due(t.key, due)}
        onOpenTask={(t) => onOpenTask(t.key, t.id)}
        selectedKey={openKey}
        locateKey={locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined}
        onAddSubtask={(t, title) => taskStore.addSubtask(spaceId, t.key, title)}
        onRenameSubtask={(t, s, title) => taskStore.renameSubtask(t.key, s.key, title)}
        onToggleSubtask={(t, s, v) => taskStore.crossSubtask(t.key, s.key, v)}
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
    <Sheet label="The Backlog" fill minHeight={MIN_HEIGHT[vp]}>
      <DayHeader day="Backlog" date={count} nav={false} compact={compact}>
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
        <Segmented items={VIEWS} value={view} onChange={turnTo} label="View" />
      </DayHeader>
      <SheetBody>
        <Sheet plain as="div" label={view === 'open' ? 'To do' : 'Crossed off'} turnKey={view} turnDir={dir}>
          {body}
        </Sheet>
      </SheetBody>
    </Sheet>
  );
}
