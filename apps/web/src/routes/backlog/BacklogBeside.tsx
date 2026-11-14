import { useQuery } from '@tanstack/react-query';
import { addDays, backlogCount, splitBacklog, type IsoDate } from '@tudu/core';
import { DayHeader, EmptyState, FoldAway, Sheet, SheetBody, TaskList, TaskListSkeleton } from '@tudu/ui';
import { useFlash, useLocate } from '../../app/dayView';
import { rowLink } from '../../app/links';
import { openInJira } from '../../app/jira';
import { useRowMenu } from '../../app/rowMenu';
import { taskStore } from '../../app/tasks';
import { monthAround, toItem } from '../today/TodayPage';

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
 * then the open tasks in your own order and "Add to the Backlog…". No project filter and no Crossed off (those stay
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
  const projects = useQuery(taskStore.projectsQuery(spaceId)).data ?? [];
  const range = monthAround(today);
  const marks = useQuery(taskStore.marksQuery(spaceId, addDays(range.from, -7), range.to)).data ?? {};
  const flash = useFlash();
  const locate = useLocate();

  const tasks = q.data?.tasks ?? [];
  const { open } = splitBacklog(tasks);
  const items = open.map((t) => toItem(t, today, projects));
  const count = q.data ? backlogCount(open.length, 'open') : '';
  const spaceIdOf = (key: string) => tasks.find((t) => t.id === key)?.spaceId ?? spaceId;
  const rowMenu = useRowMenu({ spaceIds: [spaceId], spaceIdOf, meId, openKey, onCloseTask });

  let body;
  if (q.isPending) body = <TaskListSkeleton rows={4} />;
  else if (q.isError && !q.data)
    body = (
      <EmptyState
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
  else
    body = (
      <>
        <FoldAway show={!open.length}>
          <EmptyState title="Nothing waiting." mark={false}>
            Drag a task here to take its day away. It waits without a day until you plan it again.
          </EmptyState>
        </FoldAway>
        <TaskList
          linkFor={rowLink}
          onSignal={(t, k) => {
            if (k === 'jira' && t.jira) openInJira(spaceIdOf(t.key), t.jira);
          }}
          tasks={items}
          label="Tasks in the Backlog"
          resetKey="beside"
          group="days"
          undated
          planButton
          leaveDone
          calendar={{ today, marks }}
          flashKey={flash && flash.day === null ? flash.id : undefined}
          locateKey={locate && locate.day === null ? `${locate.id}:${locate.nonce}` : undefined}
          addLabel="Add to the Backlog…"
          onAdd={(text, before) => {
            const at = before ? open.findIndex((t) => t.id === before) : undefined;
            return taskStore.create(spaceId, null, text, at === -1 ? undefined : at);
          }}
          onLeave={(t) => taskStore.cross(t.key, true)}
          onUnleave={(t) => taskStore.cross(t.key, false)}
          onReorder={(_, moved) => taskStore.place(moved.key, null, moved.to)}
          onReceive={(key, at) => taskStore.place(key, null, at)}
          onMoveTask={(t, to, _from, at) => taskStore.place(t.key, to, at)}
          onDueChange={(t, due) => taskStore.due(t.key, due)}
          onOpenTask={(t) => onOpenTask(t.key, t.id)}
          menu={rowMenu}
          selectedKey={openKey}
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
      </>
    );

  return (
    <Sheet label="The Backlog, beside the day" fill minHeight={MIN_HEIGHT}>
      <DayHeader eyebrow="No day" day="Backlog" date={count} dateTurn nav={false} />
      <SheetBody>{body}</SheetBody>
    </Sheet>
  );
}
