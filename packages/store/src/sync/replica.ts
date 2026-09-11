import type {
  AppNotification,
  Comment,
  CreateTaskRequest,
  InboxHistoryItem,
  InboxPendingItem,
  ReportDayResponse,
  SyncEvent,
  SyncOp,
  Task,
  TeamInvite,
  TeamResponse,
  TimelineEvent,
  UpdateTaskRequest,
} from "@tudu/shared";

export type Replica = {
  viewerId: string | null;
  owners: Record<string, string>;
  tasks: Record<string, Task>;
  commentsByTask: Record<string, Comment[]>;
  timelineByTask: Record<string, TimelineEvent[]>;
  timelineHasMore: Record<string, boolean>;
  inboxPending: InboxPendingItem[];
  inboxHistory: InboxHistoryItem[];
  teamByDate: Record<string, TeamResponse>;
  reportDays: Record<string, ReportDayResponse>;
  notifications: AppNotification[];
  remoteMovedTaskIds: string[];
};

export type PendingMutation = {
  clientMutationId: string;
  op: SyncOp;
};

export function emptyReplica(): Replica {
  return {
    viewerId: null,
    owners: {},
    tasks: {},
    commentsByTask: {},
    timelineByTask: {},
    timelineHasMore: {},
    inboxPending: [],
    inboxHistory: [],
    teamByDate: {},
    reportDays: {},
    notifications: [],
    remoteMovedTaskIds: [],
  };
}

function cloneReplica(replica: Replica): Replica {
  return {
    viewerId: replica.viewerId,
    owners: { ...replica.owners },
    tasks: { ...replica.tasks },
    commentsByTask: { ...replica.commentsByTask },
    timelineByTask: { ...replica.timelineByTask },
    timelineHasMore: { ...replica.timelineHasMore },
    inboxPending: [...replica.inboxPending],
    inboxHistory: [...replica.inboxHistory],
    teamByDate: { ...replica.teamByDate },
    reportDays: { ...replica.reportDays },
    notifications: [...replica.notifications],
    remoteMovedTaskIds: [...replica.remoteMovedTaskIds],
  };
}

function reportDayKey(userId: string, date: string): string {
  return `${userId}:${date}`;
}

function sortComments(rows: Comment[]): Comment[] {
  return rows.slice().sort((a, b) => {
    if (a.createdAt < b.createdAt) {
      return -1;
    }
    if (a.createdAt > b.createdAt) {
      return 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function upsertTask(
  replica: Replica,
  task: Task,
  ownerId: string,
  markRemoteMove: boolean,
): void {
  const previous = replica.tasks[task.id];
  replica.tasks[task.id] = task;
  replica.owners[task.id] = ownerId;
  if (
    markRemoteMove &&
    previous &&
    (previous.position !== task.position ||
      previous.bucket !== task.bucket ||
      previous.scheduledDate !== task.scheduledDate)
  ) {
    replica.remoteMovedTaskIds = [...replica.remoteMovedTaskIds, task.id];
  }

  for (const [key, day] of Object.entries(replica.reportDays)) {
    const split = key.lastIndexOf(":");
    const reportId = split === -1 ? key : key.slice(0, split);
    const index = day.tasks.findIndex((entry) => entry.id === task.id);
    const belongs =
      ownerId === reportId && task.scheduledDate === day.date && !task.isPrivate;
    const nextTasks = [...day.tasks];
    if (belongs) {
      if (index === -1) {
        nextTasks.push(task);
      } else {
        nextTasks[index] = task;
      }
    } else if (index !== -1) {
      nextTasks.splice(index, 1);
    } else {
      continue;
    }
    replica.reportDays[key] = {
      ...day,
      tasks: nextTasks.sort((a, b) => a.position - b.position),
    };
  }
}

function removeTask(replica: Replica, taskId: string): void {
  delete replica.tasks[taskId];
  delete replica.owners[taskId];
  delete replica.commentsByTask[taskId];
  delete replica.timelineByTask[taskId];
  delete replica.timelineHasMore[taskId];
  replica.inboxPending = replica.inboxPending.filter((item) => item.task.id !== taskId);
  for (const [key, day] of Object.entries(replica.reportDays)) {
    replica.reportDays[key] = {
      ...day,
      tasks: day.tasks.filter((task) => task.id !== taskId),
    };
  }
}

export function applyEvent(replica: Replica, event: SyncEvent): Replica {
  const next = cloneReplica(replica);
  next.remoteMovedTaskIds = [];

  switch (event.type) {
    case "task.upsert": {
      const payload = event.payload as { task: Task; ownerId: string } | Task;
      if ("task" in payload && "ownerId" in payload) {
        upsertTask(next, payload.task, payload.ownerId, true);
      } else {
        upsertTask(next, payload, next.viewerId ?? "", true);
      }
      return next;
    }
    case "task.delete":
    case "task.hide": {
      const id = (event.payload as { id: string }).id;
      removeTask(next, id);
      return next;
    }
    case "comment.upsert": {
      const comment = event.payload as Comment;
      const existing = next.commentsByTask[comment.taskId] ?? [];
      const index = existing.findIndex((row) => row.id === comment.id);
      const comments =
        index === -1
          ? [...existing, comment]
          : existing.map((row) => (row.id === comment.id ? comment : row));
      next.commentsByTask[comment.taskId] = sortComments(comments);
      const task = next.tasks[comment.taskId];
      if (task) {
        next.tasks[comment.taskId] = { ...task, commentCount: comments.length };
      }
      return next;
    }
    case "comment.delete": {
      const payload = event.payload as { id: string; taskId: string };
      const existing = next.commentsByTask[payload.taskId] ?? [];
      const comments = existing.filter((row) => row.id !== payload.id);
      next.commentsByTask[payload.taskId] = comments;
      const task = next.tasks[payload.taskId];
      if (task) {
        next.tasks[payload.taskId] = { ...task, commentCount: comments.length };
      }
      return next;
    }
    case "timeline.append": {
      const row = event.payload as TimelineEvent;
      const existing = next.timelineByTask[row.taskId] ?? [];
      if (existing.some((item) => item.id === row.id)) {
        return next;
      }
      next.timelineByTask[row.taskId] = [...existing, row].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
      );
      return next;
    }
    case "inbox.upsert": {
      const payload = event.payload as InboxPendingItem | { history: InboxHistoryItem[] };
      if ("history" in payload && Array.isArray(payload.history) && !("task" in payload)) {
        next.inboxHistory = payload.history;
        return next;
      }
      const item = payload as InboxPendingItem;
      const index = next.inboxPending.findIndex((row) => row.id === item.id);
      next.inboxPending =
        index === -1
          ? [...next.inboxPending, item]
          : next.inboxPending.map((row) => (row.id === item.id ? item : row));
      return next;
    }
    case "inbox.delete": {
      const payload = event.payload as { id: string; history?: InboxHistoryItem };
      next.inboxPending = next.inboxPending.filter((item) => item.id !== payload.id);
      if (payload.history) {
        next.inboxHistory = [
          payload.history,
          ...next.inboxHistory.filter((item) => item.id !== payload.history!.id),
        ];
      }
      return next;
    }
    case "invite.upsert": {
      const invite = event.payload as TeamInvite;
      for (const [date, team] of Object.entries(next.teamByDate)) {
        const list =
          invite.direction === "incoming" ? team.incomingInvites : team.outgoingInvites;
        const index = list.findIndex((row) => row.id === invite.id);
        const updated =
          index === -1
            ? [...list, invite]
            : list.map((row) => (row.id === invite.id ? invite : row));
        next.teamByDate[date] = {
          ...team,
          incomingInvites:
            invite.direction === "incoming" ? updated : team.incomingInvites,
          outgoingInvites:
            invite.direction === "outgoing" ? updated : team.outgoingInvites,
        };
      }
      return next;
    }
    case "roster.upsert": {
      const payload = event.payload as { date: string; team: TeamResponse };
      next.teamByDate[payload.date] = payload.team;
      return next;
    }
    case "reportDay.upsert": {
      const payload = event.payload as ReportDayResponse;
      next.reportDays[reportDayKey(payload.report.id, payload.date)] = payload;
      for (const task of payload.tasks) {
        upsertTask(next, task, payload.report.id, false);
      }
      return next;
    }
    case "notification.upsert": {
      const row = event.payload as AppNotification;
      const existing = next.notifications.findIndex((item) => item.id === row.id);
      const list =
        existing === -1
          ? [row, ...next.notifications]
          : next.notifications.map((item) => (item.id === row.id ? row : item));
      next.notifications = list
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .slice(0, 50);
      return next;
    }
    case "notification.readAll": {
      const readAt = (event.payload as { readAt: string }).readAt;
      next.notifications = next.notifications.map((item) =>
        item.readAt ? item : { ...item, readAt },
      );
      return next;
    }
    default:
      return next;
  }
}

function mergePatch(task: Task, patch: UpdateTaskRequest, siblings: Task[]): Task {
  const { completed, inProgress: patchInProgress, ...rest } = patch;
  const next = { ...task, ...rest, updatedAt: new Date().toISOString() };

  if ("completed" in patch) {
    const completing = completed === true;
    next.completedAt = completing ? new Date().toISOString() : null;
    if (completing) {
      next.inProgress = false;
      const lane = siblings.filter(
        (entry) =>
          entry.id !== task.id &&
          entry.scheduledDate === task.scheduledDate &&
          entry.bucket === task.bucket,
      );
      if (lane.length > 0) {
        next.position = Math.max(...lane.map((entry) => entry.position)) + 1;
      }
    }
  }

  if ("inProgress" in patch && next.completedAt === null) {
    next.inProgress = patchInProgress ?? false;
  }

  return next;
}

function applyReorderToTasks(
  tasks: Record<string, Task>,
  lanes: { scheduledDate: string | null; bucket: Task["bucket"]; taskIds: string[] }[],
): Record<string, Task> {
  const next = { ...tasks };
  for (const lane of lanes) {
    lane.taskIds.forEach((taskId, index) => {
      const task = next[taskId];
      if (!task) {
        return;
      }
      next[taskId] = {
        ...task,
        scheduledDate: lane.scheduledDate,
        bucket: lane.bucket,
        position: index,
      };
    });
  }
  return next;
}

function optimisticTask(id: string, body: CreateTaskRequest): Task {
  const now = new Date().toISOString();
  return {
    id,
    title: body.title,
    description: body.description ?? null,
    scheduledDate: body.scheduledDate ?? null,
    bucket: body.bucket ?? null,
    position: 0,
    startDate: body.startDate ?? null,
    deadline: body.deadline ?? null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: body.isPrivate ?? false,
    createdAt: now,
    updatedAt: now,
    subtasks: [],
    commentCount: 0,
  };
}

export function applyOp(replica: Replica, op: SyncOp): Replica {
  const next = cloneReplica(replica);
  next.remoteMovedTaskIds = [];

  switch (op.type) {
    case "task.create": {
      next.tasks[op.id] = optimisticTask(op.id, op.body);
      if (next.viewerId) {
        next.owners[op.id] = next.viewerId;
      }
      return next;
    }
    case "task.update": {
      const task = next.tasks[op.id];
      if (!task) {
        return next;
      }
      next.tasks[op.id] = mergePatch(task, op.patch, Object.values(next.tasks));
      return next;
    }
    case "task.delete": {
      removeTask(next, op.id);
      return next;
    }
    case "task.reorder": {
      next.tasks = applyReorderToTasks(next.tasks, op.body.lanes);
      return next;
    }
    case "task.rollover": {
      return next;
    }
    case "subtask.create": {
      const task = next.tasks[op.taskId];
      if (!task) {
        return next;
      }
      const now = new Date().toISOString();
      next.tasks[op.taskId] = {
        ...task,
        subtasks: [
          ...task.subtasks,
          {
            id: op.id,
            taskId: op.taskId,
            title: op.body.title,
            done: false,
            position: task.subtasks.length,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      return next;
    }
    case "subtask.update": {
      for (const [taskId, task] of Object.entries(next.tasks)) {
        if (!task.subtasks.some((subtask) => subtask.id === op.id)) {
          continue;
        }
        next.tasks[taskId] = {
          ...task,
          subtasks: task.subtasks.map((subtask) =>
            subtask.id === op.id ? { ...subtask, ...op.patch } : subtask,
          ),
        };
      }
      return next;
    }
    case "subtask.delete": {
      for (const [taskId, task] of Object.entries(next.tasks)) {
        if (!task.subtasks.some((subtask) => subtask.id === op.id)) {
          continue;
        }
        next.tasks[taskId] = {
          ...task,
          subtasks: task.subtasks.filter((subtask) => subtask.id !== op.id),
        };
      }
      return next;
    }
    case "subtask.reorder": {
      const task = next.tasks[op.taskId];
      if (!task) {
        return next;
      }
      const byId = new Map(task.subtasks.map((subtask) => [subtask.id, subtask]));
      next.tasks[op.taskId] = {
        ...task,
        subtasks: op.body.subtaskIds
          .map((id, index) => {
            const subtask = byId.get(id);
            return subtask ? { ...subtask, position: index } : null;
          })
          .filter((subtask): subtask is Task["subtasks"][number] => subtask !== null),
      };
      return next;
    }
    case "comment.create": {
      const existing = next.commentsByTask[op.taskId] ?? [];
      const now = new Date().toISOString();
      const row: Comment = {
        id: op.id,
        taskId: op.taskId,
        authorId: "",
        body: op.body.body,
        editedAt: null,
        createdAt: now,
        updatedAt: now,
        author: { id: "", name: "You", email: "" },
      };
      next.commentsByTask[op.taskId] = sortComments([...existing, row]);
      const task = next.tasks[op.taskId];
      if (task) {
        next.tasks[op.taskId] = { ...task, commentCount: task.commentCount + 1 };
      }
      return next;
    }
    case "comment.update": {
      const existing = next.commentsByTask[op.taskId] ?? [];
      next.commentsByTask[op.taskId] = existing.map((row) =>
        row.id === op.id
          ? { ...row, body: op.patch.body, editedAt: new Date().toISOString() }
          : row,
      );
      return next;
    }
    case "comment.delete": {
      const existing = next.commentsByTask[op.taskId] ?? [];
      next.commentsByTask[op.taskId] = existing.filter((row) => row.id !== op.id);
      const task = next.tasks[op.taskId];
      if (task) {
        next.tasks[op.taskId] = {
          ...task,
          commentCount: Math.max(0, task.commentCount - 1),
        };
      }
      return next;
    }
    case "inbox.accept":
    case "inbox.decline": {
      const item = next.inboxPending.find((row) => row.id === op.id);
      next.inboxPending = next.inboxPending.filter((row) => row.id !== op.id);
      if (item) {
        const status = op.type === "inbox.accept" ? "accepted" : "declined";
        next.inboxHistory = [
          {
            id: item.id,
            status,
            title: item.task.title,
            from: item.from,
            bucket: op.type === "inbox.accept" ? op.body.bucket : null,
            declineReason:
              op.type === "inbox.decline" ? op.body.reason : item.declineReason,
            createdAt: item.createdAt,
          },
          ...next.inboxHistory,
        ];
      }
      return next;
    }
    case "team.invite.create": {
      return next;
    }
    case "team.invite.accept":
    case "team.invite.decline": {
      for (const [date, team] of Object.entries(next.teamByDate)) {
        next.teamByDate[date] = {
          ...team,
          incomingInvites: team.incomingInvites.filter((invite) => invite.id !== op.id),
        };
      }
      return next;
    }
    case "team.task.send": {
      return next;
    }
    case "team.task.reorder": {
      next.tasks = applyReorderToTasks(next.tasks, op.body.lanes);
      for (const [key, day] of Object.entries(next.reportDays)) {
        if (!key.startsWith(`${op.userId}:`)) {
          continue;
        }
        next.reportDays[key] = {
          ...day,
          tasks: day.tasks
            .map((task) => next.tasks[task.id] ?? task)
            .filter((task) => task.scheduledDate === day.date)
            .sort((a, b) => a.position - b.position),
        };
      }
      return next;
    }
    case "team.task.delete": {
      removeTask(next, op.taskId);
      return next;
    }
    case "notification.read": {
      const readAt = new Date().toISOString();
      next.notifications = next.notifications.map((item) =>
        item.id === op.id ? { ...item, readAt: item.readAt ?? readAt } : item,
      );
      return next;
    }
    case "notification.readAll": {
      const readAt = new Date().toISOString();
      next.notifications = next.notifications.map((item) =>
        item.readAt ? item : { ...item, readAt },
      );
      return next;
    }
    default: {
      return next;
    }
  }
}

export function replayPending(confirmed: Replica, pending: PendingMutation[]): Replica {
  if (pending.length === 0) {
    return confirmed;
  }
  const next = pending.reduce(
    (replica, mutation) => applyOp(replica, mutation.op),
    confirmed,
  );
  next.remoteMovedTaskIds = confirmed.remoteMovedTaskIds;
  return next;
}

export function tasksForDay(replica: Replica, date: string): Task[] {
  return Object.values(replica.tasks)
    .filter((task) => {
      if (task.scheduledDate !== date) {
        return false;
      }
      if (!replica.viewerId) {
        return true;
      }
      const ownerId = replica.owners[task.id];
      return !ownerId || ownerId === replica.viewerId;
    })
    .sort((a, b) => {
      const bucketRank = { now: 0, next: 1, later: 2 };
      const left = a.bucket ? bucketRank[a.bucket] : 3;
      const right = b.bucket ? bucketRank[b.bucket] : 3;
      if (left !== right) {
        return left - right;
      }
      return a.position - b.position;
    });
}

export function unscheduledTasks(replica: Replica): Task[] {
  return Object.values(replica.tasks)
    .filter((task) => {
      if (task.scheduledDate !== null) {
        return false;
      }
      if (!replica.viewerId) {
        return true;
      }
      const ownerId = replica.owners[task.id];
      return !ownerId || ownerId === replica.viewerId;
    })
    .sort((a, b) => a.position - b.position);
}

export { reportDayKey };
