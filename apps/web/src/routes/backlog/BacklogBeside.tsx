import { useQuery } from '@tanstack/react-query';
import { addDays, backlogCount, splitBacklog, type IsoDate } from '@tudu/core';
import {
  DayHeader,
  EmptyState,
  FoldAway,
  Sheet,
  SheetBody,
  TaskGroups,
  TaskList,
  TaskListSkeleton,
  type TaskItem,
} from '@tudu/ui';
import { useProjectGroups } from '../../app/grouped';
import { openQuickAdd, useFlash, useLocate } from '../../app/dayView';
import { rowLink } from '../../app/links';
import { openInJira } from '../../app/jira';
import { useRowMenu } from '../../app/rowMenu';
import { taskStore } from '../../app/tasks';
import { monthAround, toItem } from '../today/TodayPage';
import { rowTimes } from '../../app/times';

const MIN_HEIGHT = 560;

interface BacklogBesideProps {
  spaceId: string;
  today: IsoDate;
  onOpenTask: (id: string, ref: string | null | undefined) => void;
  openKey?: string;
  meId?: string;
  /** Deleting the task open in the panel closes the panel. */
  onCloseTask?: () => void;
}

/**
 * The Backlog beside the day on the desk (#102): a lean sheet on the day's left. "No day", Backlog and the count,
 * then the open tasks in your own order and "Add to the Backlog…". Empty, "Nothing waiting." sits in the middle with New task (Quick Add, no day),
 * and the whole sheet takes a drop. No project filter and no Crossed off (those stay
 * on the Backlog page: a filtered list can't take drops). Tasks drag across both ways in the "days" group, or move
 * with the row's calendar button. Same cache as the Backlog page and the week's Backlog tile.
 */
export function BacklogBeside({
  spaceId,
  today,
  onOpenTask,
  openKey,
  meId,
  onCloseTask,
}: BacklogBesideProps) {
  const q = useQuery(taskStore.backlogQuery(spaceId));
  const projectsQ = useQuery(taskStore.projectsQuery(spaceId));
  const projects = projectsQ.data ?? [];
  const range = monthAround(today);
  const marks = useQuery(taskStore.marksQuery(spaceId, addDays(range.from, -7), range.to)).data ?? {};
  const flash = useFlash();
  const locate = useLocate();

  const tasks = q.data?.tasks ?? [];
  const { open } = splitBacklog(tasks);
  const items = open.map((t) => toItem(t, today, projects));
  // Nothing waiting: the words in the body say so, the title line stays quiet (not said twice).
  const count = q.data && open.length ? backlogCount(open.length, 'open') : '';
  const spaceIdOf = (key: string) => tasks.find((t) => t.id === key)?.spaceId ?? spaceId;
  // By project: the same choice and folds as the day beside it. Grouped, rows move inside their project only, so
  // dragging to and from the day comes back in My order; the row's calendar button moves a task either way.
  const g = useProjectGroups({ spaceId, tasks: open, items, projects, ready: projectsQ.isSuccess });
  const ids = open.map((t) => t.id);
  const rowMenu = useRowMenu({ spaceIds: [spaceId], spaceIdOf, meId, openKey, onCloseTask });

  let body;
  if (q.isPending) body = <TaskListSkeleton rows={4} grouped={g.wanted} />;
  else if (q.isError && !q.data)
    body = (
      <EmptyState
        fill
        tone="error"
        title="The Backlog didn’t load."
        action="Try again"
        loading={q.isFetching}
        loadingLabel="Trying again"
        onAction={() => void q.refetch()}
      >
        Check your connection. Your day is still here.
      </EmptyState>
    );
  else {
    const rows = {
      menu: rowMenu,
      linkFor: rowLink,
      onSignal: (t: TaskItem, k: string) => {
        if (k === 'jira' && t.jira) openInJira(spaceIdOf(t.key), t.jira);
      },
      undated: true,
      planButton: true,
      leaveDone: true,
      calendar: { today, marks },
      flashKey: flash && flash.day === null ? flash.id : undefined,
      locateKey: locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined,
      // Empty, the words' New task is the way in: no writing line under them.
      addLabel: open.length ? 'Add to the Backlog…' : undefined,
      onAddOpen: () => openQuickAdd({ day: null, projectId: g.on ? null : undefined }),
      onLeave: (t: TaskItem) => taskStore.cross(t.key, true),
      onUnleave: (t: TaskItem) => taskStore.cross(t.key, false),
      onMoveTask: (t: TaskItem, to: IsoDate | null, _from: IsoDate | null, at?: number) =>
        taskStore.place(t.key, to, at),
      onDueChange: (t: TaskItem, due: IsoDate | null) => taskStore.due(t.key, due),
      timeWords: rowTimes.timeWords,
      onDueTimeChange: rowTimes.onDueTimeChange,
      onOpenTask: (t: TaskItem) => onOpenTask(t.key, t.id),
      selectedKey: openKey,
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
    body = (
      <>
        <FoldAway show={!open.length} fill>
          <EmptyState
            fill
            title="Nothing waiting."
            mark={false}
            action="New task"
            onAction={() => openQuickAdd({ day: null })}
          >
            Drag a task here to take its day away, or write a new one.
          </EmptyState>
        </FoldAway>
        {g.on ? (
          <TaskGroups
            {...rows}
            groups={g.groups}
            folded={g.folded}
            onFold={g.fold}
            resetKey="beside"
            onGroupAdd={(group) => openQuickAdd({ day: null, projectId: g.target(group).projectId ?? null })}
            onReorder={(group, moved) =>
              taskStore.place(moved.key, null, g.place(ids, group, moved.key, moved.to))
            }
          />
        ) : (
          <TaskList
            {...rows}
            tasks={items}
            label="Tasks in the Backlog"
            resetKey="beside"
            group="days"
            fillEmpty
            onReorder={(_, moved) => taskStore.place(moved.key, null, moved.to)}
            onReceive={(key, at) => taskStore.place(key, null, at)}
          />
        )}
      </>
    );
  }

  return (
    <Sheet label="The Backlog, beside the day" fill minHeight={MIN_HEIGHT}>
      <DayHeader
        eyebrow="No day"
        day="Backlog"
        date={count}
        dateTurn
        nav={false}
        aside={q.isPending || (q.isError && !q.data) ? null : g.control}
      />
      <SheetBody>{body}</SheetBody>
    </Sheet>
  );
}
