import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  carriedLabel,
  dayWord,
  daysInMonth,
  historyWords,
  ownerWords,
  relativeDayLabel,
  weekdayName,
  whenWords,
  type IsoDate,
  type TaskDetail as TaskDetailData,
} from '@tudu/core';
import {
  Drawer,
  EmptyState,
  TaskDetail,
  TaskDetailSkeleton,
  showToast,
  type DetailComment,
  type SubtaskItem,
  type TaskDetailTask,
} from '@tudu/ui';
import { useEffect, useState } from 'react';
import { API_URL } from '../../app/config';
import { initialsOf } from '../../app/session';
import { addRecentTask } from '../../app/search';
import { useSpace } from '../../app/space';
import { taskStore } from '../../app/tasks';
import type { Viewport } from '../../app/viewport';

export interface OpenTask {
  id: string;
  /** Which way the panel's content slid in: stepping with the arrows. */
  dir: 'next' | 'prev';
}

export interface TaskPanelProps {
  spaceId: string;
  open: OpenTask | null;
  today: IsoDate;
  vp: Viewport;
  me: { id: string; name: string; email: string };
  onClose: () => void;
  /** Step to another task of the same day. */
  onStep: (id: string, dir: 'next' | 'prev') => void;
  /** The task's ref became known (a task written a moment ago): the address can carry it now. */
  onRef?: (ref: string) => void;
  /** Where "Copy link to task" points. */
  linkFor: (ref: string) => string;
  /** The back label for a task on a day (or none): the week page says "Week" and "Backlog". */
  backFor?: (day: IsoDate | null) => string;
}

/** The month around a day, with a week either side, for the Planned picker's dots. */
function monthAround(day: IsoDate): { from: IsoDate; to: IsoDate } {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const first = `${day.slice(0, 7)}-01`;
  const last = `${day.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
  return { from: addDays(first, -7), to: addDays(last, 7) };
}

/**
 * The task panel: a paper drawer over the page on the desk and tablets (460px there), its own page on phones.
 * Reads the task in full, applies every change through the store at once, and steps through the task's day with
 * the arrows.
 */
export function TaskPanel(p: TaskPanelProps) {
  const { spaceId, open, today, vp } = p;
  const compact = vp === 'phone';
  const space = useSpace();
  // "Just now", "Thu 10:12": the clock is read when the panel opens or changes task, and once a minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    setNow(new Date());
  }
  // A task you open joins Search's "Recently opened".
  useEffect(() => {
    if (open) addRecentTask(spaceId, open.id);
  }, [open, spaceId]);
  // The last task keeps rendering while the drawer eases out.
  const [last, setLast] = useState<OpenTask | null>(open);
  if (open && open !== last) setLast(open);
  const shown = open ?? last;
  const id = shown?.id ?? '';
  const q = useQuery({ ...taskStore.taskQuery(spaceId, id), enabled: !!shown });
  const detail = q.data;
  const day = detail?.day ?? today;
  const range = monthAround(day);
  const marks = useQuery({
    ...taskStore.marksQuery(spaceId, range.from, range.to),
    enabled: !!shown,
  }).data;
  // Neighbours on the task's day (or in the Backlog), for the arrows.
  const list = useQuery({
    ...taskStore.listQuery(spaceId, detail?.day ?? null, today),
    enabled: !!shown && !!detail,
  }).data?.tasks;
  const projects = useQuery({ ...taskStore.projectsQuery(spaceId), enabled: !!shown }).data ?? [];
  const at = list?.findIndex((t) => t.id === id) ?? -1;
  const prev = at > 0 ? list![at - 1] : undefined;
  const next = at >= 0 && list && at < list.length - 1 ? list[at + 1] : undefined;

  const onRef = p.onRef;
  useEffect(() => {
    if (open && detail?.ref && detail.id === open.id) onRef?.(detail.ref);
  }, [open, detail?.ref, detail?.id, onRef]);

  const backLabel =
    detail && p.backFor
      ? p.backFor(detail.day)
      : detail?.day
        ? relativeDayLabel(detail.day, today) === 'Today'
          ? 'Today'
          : weekdayName(detail.day)
        : 'Backlog';

  let body;
  if (!shown) body = null;
  else if (q.isPending)
    body = <TaskDetailSkeleton compact={compact} onClose={p.onClose} backLabel={backLabel} />;
  else if (q.isError || !detail)
    body = (
      <div className="tp-root tp-td">
        <div className="tp-td-scroll">
          <EmptyState
            tone="error"
            title="This task didn’t load."
            action="Try again"
            loading={q.isFetching}
            loadingLabel="Trying again"
            onAction={() => void q.refetch()}
          >
            Check your connection. Nothing you wrote is lost.
          </EmptyState>
        </div>
      </div>
    );
  else body = panelFor(detail);

  function panelFor(d: TaskDetailData) {
    // Someone else's task (from People): read and comment, change nothing.
    const theirs = !!d.ownerId && d.ownerId !== p.me.id;
    const owner = d.owner ?? (theirs ? { id: d.ownerId!, name: 'Someone', email: '', color: null } : null);
    const task: TaskDetailTask = {
      key: d.id,
      id: d.ref,
      title: d.title,
      done: d.done,
      day: d.day,
      carried: d.carriedFrom && !d.done ? carriedLabel(d.carriedFrom, today) : undefined,
      due: d.due,
      visibility: d.visibility,
      projectId: d.projectId,
      notes: d.notes,
      subtasks: d.subtasks.map((s) => ({ key: s.id, title: s.title, done: s.done })),
      comments: d.comments.map((c) => ({
        key: c.id,
        who: c.author.id === p.me.id ? p.me.name || p.me.email : c.author.name || c.author.email,
        initials: initialsOf(c.author.name, c.author.email),
        when: whenWords(c.createdAt, now),
        html: c.html,
        mine: c.author.id === p.me.id,
        edited: !!c.editedAt,
      })),
      history: d.history.map((e) => ({
        key: e.id,
        text: historyWords(e, today),
        when: whenWords(e.at, now),
      })),
    };
    const subById = (s: SubtaskItem) => d.subtasks.find((x) => x.id === s.key);
    return (
      <TaskDetail
        task={task}
        today={today}
        me={{ initials: initialsOf(p.me.name, p.me.email), name: p.me.name || p.me.email }}
        visibility={
          space.kind === 'team'
            ? [
                { value: 'space', label: `Everyone in ${space.name}` },
                { value: 'me', label: 'Only you' },
              ]
            : [{ value: 'space', label: 'Only you' }]
        }
        readOnly={theirs}
        owner={
          theirs && owner
            ? {
                name: owner.name || owner.email,
                initials: initialsOf(owner.name, owner.email),
                color: owner.color,
              }
            : undefined
        }
        ownerLine={theirs && owner ? ownerWords(d.day, owner.name || owner.email, today) : undefined}
        calendar={{ marks: marks ?? {} }}
        projects={projects}
        fileBase={API_URL}
        turnDir={shown?.dir}
        backLabel={backLabel}
        compact={compact}
        link={d.ref ? p.linkFor(d.ref) : undefined}
        onPrev={prev ? () => p.onStep(prev.id, 'prev') : undefined}
        onNext={next ? () => p.onStep(next.id, 'next') : undefined}
        onClose={p.onClose}
        onRename={(title) => taskStore.rename(d.id, title)}
        onCross={(done) => taskStore.cross(d.id, done)}
        onMove={(to) => {
          taskStore.place(d.id, to);
          showToast(`Moved to ${dayWord(to, today)}`);
        }}
        onDue={(due) => taskStore.due(d.id, due)}
        onVisibility={(v) => taskStore.visibility(d.id, v)}
        onProject={(projectId) => taskStore.setProject(d.id, projectId)}
        onNewProject={(name) => taskStore.createProject(spaceId, name)}
        onNotes={(html) => taskStore.notes(d.id, html)}
        onAttach={(file, onProgress) => taskStore.upload(spaceId, file, d.id, onProgress)}
        onAddSubtask={(title) => taskStore.addSubtask(spaceId, d.id, title)}
        onRenameSubtask={(s, title) => taskStore.renameSubtask(d.id, s.key, title)}
        onToggleSubtask={(s, done) => taskStore.crossSubtask(d.id, s.key, done)}
        onReorderSubtask={(s, _from, to) => taskStore.placeSubtask(spaceId, d.id, s.key, to)}
        onDeleteSubtask={(s) => taskStore.removeSubtask(d.id, s.key)}
        onRestoreSubtask={(s, index) => {
          const was = subById(s);
          taskStore.restoreSubtask(
            spaceId,
            d.id,
            was ?? {
              id: s.key,
              taskId: d.id,
              title: s.title,
              position: 0,
              done: s.done,
              createdAt: '',
              updatedAt: '',
            },
            index,
          );
        }}
        onAddComment={(html) => taskStore.addComment(d.id, html)}
        onEditComment={(c, html) => taskStore.editComment(d.id, c.key, html)}
        onDeleteComment={(c: DetailComment) => taskStore.removeComment(d.id, c.key)}
        onRestoreComment={(c) => taskStore.restoreComment(d.id, c.html)}
        onDelete={
          theirs
            ? undefined
            : () => {
                p.onClose();
                taskStore.remove(d.id);
                showToast('Task deleted', { action: 'Undo', onAction: () => taskStore.restore(d.id) });
              }
        }
      />
    );
  }

  return (
    <Drawer
      open={!!open}
      onClose={p.onClose}
      label="Task details"
      fullscreen={compact}
      width={vp === 'tablet' ? 460 : undefined}
    >
      {body}
    </Drawer>
  );
}
