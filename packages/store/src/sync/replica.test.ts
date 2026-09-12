import { describe, expect, it } from "vitest";
import type {
  AppNotification,
  Comment,
  InboxPendingItem,
  SyncEvent,
  Task,
  TimelineEvent,
} from "@tudu/shared";
import {
  applyEvent,
  applyOp,
  emptyReplica,
  replayPending,
  reportDayKey,
  tasksForDay,
  unscheduledForOwner,
  type PendingMutation,
  type Replica,
} from "./replica.js";

const now = "2026-09-10T08:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Ship it",
    description: null,
    scheduledDate: "2026-09-10",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: now,
    updatedAt: now,
    commentCount: 0,
    project: null,
    subtasks: [],
    ...overrides,
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    taskId: "11111111-1111-4111-8111-111111111111",
    authorId: "marcus",
    body: "Looks good",
    editedAt: null,
    createdAt: now,
    updatedAt: now,
    author: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
    ...overrides,
  };
}

function event(overrides: Partial<SyncEvent> & Pick<SyncEvent, "type" | "payload">): SyncEvent {
  return {
    seq: 1,
    recipientUserId: "priya",
    clientMutationId: null,
    ...overrides,
  };
}

describe("applyEvent", () => {
  it("upserts a task", () => {
    const task = makeTask();
    const next = applyEvent(
      emptyReplica(),
      event({ type: "task.upsert", payload: { task, ownerId: "priya" } }),
    );
    expect(next.tasks[task.id]?.title).toBe("Ship it");
  });

  it("hides a task from the replica", () => {
    const task = makeTask();
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "task.upsert", payload: { task, ownerId: "priya" } }),
    );
    replica = applyEvent(
      replica,
      event({ type: "task.hide", payload: { id: task.id }, seq: 2 }),
    );
    expect(replica.tasks[task.id]).toBeUndefined();
  });

  it("appends a comment Marcus wrote", () => {
    const row = comment();
    const next = applyEvent(
      emptyReplica(),
      event({ type: "comment.upsert", payload: row }),
    );
    expect(next.commentsByTask[row.taskId]?.map((item) => item.body)).toEqual([
      "Looks good",
    ]);
  });

  it("keeps comments oldest-first when a live row arrives before bootstrap", () => {
    const newer = comment({
      id: "55555555-5555-4555-8555-555555555555",
      body: "hello",
      createdAt: "2026-09-11T12:37:00.000Z",
    });
    const older = comment({
      body: "hi",
      createdAt: "2026-09-10T17:48:00.000Z",
    });
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "comment.upsert", payload: newer }),
    );
    replica = applyEvent(
      replica,
      event({ type: "comment.upsert", payload: older, seq: 0 }),
    );
    expect(replica.commentsByTask[older.taskId]?.map((item) => item.body)).toEqual([
      "hi",
      "hello",
    ]);
  });

  it("appends a timeline event without wiping older ones", () => {
    const first: TimelineEvent = {
      id: "33333333-3333-4333-8333-333333333333",
      taskId: "11111111-1111-4111-8111-111111111111",
      actorId: "marcus",
      actor: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
      type: "inbox_sent",
      data: {},
      createdAt: now,
    };
    const second: TimelineEvent = {
      ...first,
      id: "44444444-4444-4444-8444-444444444444",
      type: "commented",
      createdAt: "2026-09-10T08:01:00.000Z",
    };
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "timeline.append", payload: first }),
    );
    replica = applyEvent(
      replica,
      event({ type: "timeline.append", payload: second, seq: 2 }),
    );
    expect(replica.timelineByTask[first.taskId]?.map((item) => item.type)).toEqual([
      "commented",
      "inbox_sent",
    ]);
  });

  it("upserts an inbox card", () => {
    const task = makeTask();
    const item: InboxPendingItem = {
      id: "55555555-5555-4555-8555-555555555555",
      kind: "assigned",
      from: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
      task,
      declineReason: null,
      createdAt: now,
    };
    const next = applyEvent(
      emptyReplica(),
      event({ type: "inbox.upsert", payload: item }),
    );
    expect(next.inboxPending).toHaveLength(1);
    expect(next.inboxPending[0]?.id).toBe(item.id);
  });

  it("moves an inbox card into history on delete", () => {
    const task = makeTask();
    const item: InboxPendingItem = {
      id: "55555555-5555-4555-8555-555555555555",
      kind: "assigned",
      from: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
      task,
      declineReason: null,
      createdAt: now,
    };
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "inbox.upsert", payload: item }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "inbox.delete",
        seq: 2,
        payload: {
          id: item.id,
          history: {
            id: item.id,
            status: "accepted",
            title: task.title,
            from: item.from,
            bucket: "next",
            declineReason: null,
            createdAt: now,
          },
        },
      }),
    );
    expect(replica.inboxPending).toHaveLength(0);
    expect(replica.inboxHistory[0]?.title).toBe("Ship it");
  });

  it("puts a report inbox snapshot in reportInbox, not the viewer inbox", () => {
    const task = makeTask({ scheduledDate: null, bucket: null });
    const item: InboxPendingItem = {
      id: "55555555-5555-4555-8555-555555555555",
      kind: "assigned",
      from: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
      task,
      declineReason: null,
      createdAt: now,
    };
    const next = applyEvent(
      emptyReplica(),
      event({
        type: "reportInbox.upsert",
        payload: {
          userId: "priya",
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          pending: [item],
          history: [],
        },
      }),
    );
    expect(next.reportInbox.priya?.pending).toHaveLength(1);
    expect(next.reportInbox.priya?.pending[0]?.id).toBe(item.id);
    expect(next.inboxPending).toHaveLength(0);
  });

  it("clears a waiting card when the report inbox snapshot is empty", () => {
    const task = makeTask({ scheduledDate: null, bucket: null });
    const item: InboxPendingItem = {
      id: "55555555-5555-4555-8555-555555555555",
      kind: "assigned",
      from: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
      task,
      declineReason: null,
      createdAt: now,
    };
    let replica = applyEvent(
      emptyReplica(),
      event({
        type: "reportInbox.upsert",
        payload: { userId: "priya", pending: [item] },
      }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "reportInbox.upsert",
        seq: 2,
        payload: { userId: "priya", pending: [] },
      }),
    );
    expect(replica.reportInbox.priya?.pending).toEqual([]);
  });
});

describe("team.task.send replica", () => {
  it("adds a waiting card to that report inbox without touching the viewer inbox", () => {
    const next = applyOp(
      { ...emptyReplica(), viewerId: "marcus" },
      {
        type: "team.task.send",
        id: "11111111-1111-4111-8111-111111111111",
        userId: "priya",
        body: {
          title: "Review the brief",
          description: "Check the latest draft",
          startDate: "2026-09-14",
          deadline: null,
        },
      },
    );
    expect(next.inboxPending).toHaveLength(0);
    expect(next.reportInbox.priya?.pending).toHaveLength(1);
    expect(next.reportInbox.priya?.pending[0]?.task.title).toBe("Review the brief");
    expect(next.reportInbox.priya?.pending[0]?.task.id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(next.reportInbox.priya?.pending[0]?.kind).toBe("assigned");
  });

  it("does not duplicate a waiting card already present for that task", () => {
    const task = makeTask({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Review the brief",
      scheduledDate: null,
      bucket: null,
    });
    const item: InboxPendingItem = {
      id: "55555555-5555-4555-8555-555555555555",
      kind: "assigned",
      from: { id: "marcus", name: "Marcus Bell", email: "marcus@egain.com" },
      task,
      declineReason: null,
      createdAt: now,
    };
    const confirmed = applyEvent(
      { ...emptyReplica(), viewerId: "marcus" },
      event({
        type: "reportInbox.upsert",
        payload: { userId: "priya", pending: [item] },
      }),
    );
    const next = applyOp(confirmed, {
      type: "team.task.send",
      id: task.id,
      userId: "priya",
      body: {
        title: "Review the brief",
        description: null,
        startDate: null,
        deadline: null,
      },
    });
    expect(next.reportInbox.priya?.pending).toHaveLength(1);
    expect(next.reportInbox.priya?.pending[0]?.id).toBe(item.id);
  });
});

describe("replayPending", () => {
  it("keeps a local title edit on top of Marcus completing the task", () => {
    const task = makeTask({ title: "Ship it" });
    const confirmed: Replica = {
      ...emptyReplica(),
      tasks: { [task.id]: task },
    };
    const pending: PendingMutation[] = [
      {
        clientMutationId: "m1",
        op: {
          type: "task.update",
          id: task.id,
          patch: { title: "Ship it today" },
        },
      },
    ];
    const afterRemote = applyEvent(
      confirmed,
      event({
        type: "task.upsert",
        payload: { task: makeTask({ title: "Ship it", completedAt: now, inProgress: false }), ownerId: "priya" },
      }),
    );
    const visible = replayPending(afterRemote, pending);
    expect(visible.tasks[task.id]?.title).toBe("Ship it today");
    expect(visible.tasks[task.id]?.completedAt).toBe(now);
  });

  it("does not show a sent comment twice while the server echo is in flight", () => {
    const task = makeTask({ commentCount: 1 });
    const row = comment();
    const confirmed = applyEvent(
      {
        ...emptyReplica(),
        tasks: { [task.id]: task },
      },
      event({ type: "comment.upsert", payload: row }),
    );
    const visible = replayPending(confirmed, [
      {
        clientMutationId: "m1",
        op: {
          type: "comment.create",
          id: row.id,
          taskId: row.taskId,
          body: { body: row.body },
        },
      },
    ]);
    expect(visible.commentsByTask[row.taskId]?.map((item) => item.id)).toEqual([
      row.id,
    ]);
    expect(visible.tasks[task.id]?.commentCount).toBe(1);
  });
});

describe("applyOp", () => {
  it("creates a task with the client id", () => {
    const id = "66666666-6666-4666-8666-666666666666";
    const next = applyOp(emptyReplica(), {
      type: "task.create",
      id,
      body: {
        title: "New",
        description: "More detail",
        scheduledDate: "2026-09-10",
        bucket: "next",
        startDate: null,
        deadline: null,
        isPrivate: false,
      },
    });
    expect(next.tasks[id]?.title).toBe("New");
    expect(next.tasks[id]?.description).toBe("More detail");
    expect(next.tasks[id]?.bucket).toBe("next");
  });

  it("applies a reorder to matching task ids", () => {
    const first = makeTask({ id: "11111111-1111-4111-8111-111111111111", position: 0 });
    const second = makeTask({
      id: "77777777-7777-4777-8777-777777777777",
      title: "Next",
      position: 1,
    });
    const next = applyOp(
      {
        ...emptyReplica(),
        tasks: { [first.id]: first, [second.id]: second },
      },
      {
        type: "task.reorder",
        body: {
          lanes: [
            {
              scheduledDate: "2026-09-10",
              bucket: "now",
              taskIds: [second.id, first.id],
            },
          ],
        },
      },
    );
    expect(next.tasks[first.id]?.position).toBe(1);
    expect(next.tasks[second.id]?.position).toBe(0);
  });

  it("moves a report task onto another cached day", () => {
    const monday = makeTask({
      scheduledDate: "2026-09-07",
      bucket: "now",
      title: "Monday work",
    });
    const tuesday = makeTask({
      id: "77777777-7777-4777-8777-777777777777",
      scheduledDate: "2026-09-08",
      bucket: "later",
      title: "Tuesday work",
    });
    let replica = applyEvent(
      emptyReplica(),
      event({
        type: "reportDay.upsert",
        payload: {
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          date: "2026-09-07",
          tasks: [monday],
          slippingCount: 0,
        },
      }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "reportDay.upsert",
        payload: {
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          date: "2026-09-08",
          tasks: [tuesday],
          slippingCount: 0,
        },
        seq: 2,
      }),
    );

    const next = applyOp(replica, {
      type: "team.task.reorder",
      userId: "priya",
      body: {
        lanes: [
          { scheduledDate: "2026-09-07", bucket: "now", taskIds: [] },
          {
            scheduledDate: "2026-09-08",
            bucket: "later",
            taskIds: [tuesday.id, monday.id],
          },
        ],
      },
    });

    expect(
      next.reportDays[reportDayKey("priya", "2026-09-07")]?.tasks.map((task) => task.id),
    ).toEqual([]);
    expect(
      next.reportDays[reportDayKey("priya", "2026-09-08")]?.tasks.map((task) => task.id),
    ).toEqual([tuesday.id, monday.id]);
    expect(next.tasks[monday.id]?.scheduledDate).toBe("2026-09-08");
    expect(next.tasks[monday.id]?.bucket).toBe("later");
  });

  it("parks a report task on the unscheduled rail", () => {
    const monday = makeTask({
      scheduledDate: "2026-09-07",
      bucket: "now",
    });
    const replica = applyEvent(
      emptyReplica(),
      event({
        type: "reportDay.upsert",
        payload: {
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          date: "2026-09-07",
          tasks: [monday],
          slippingCount: 0,
        },
      }),
    );

    const next = applyOp(replica, {
      type: "team.task.reorder",
      userId: "priya",
      body: {
        lanes: [
          { scheduledDate: "2026-09-07", bucket: "now", taskIds: [] },
          { scheduledDate: null, bucket: null, taskIds: [monday.id] },
        ],
      },
    });

    expect(
      next.reportDays[reportDayKey("priya", "2026-09-07")]?.tasks.map((task) => task.id),
    ).toEqual([]);
    expect(unscheduledForOwner(next, "priya").map((task) => task.id)).toEqual([
      monday.id,
    ]);
  });

  it("drops an unscheduled report task onto a cached day", () => {
    const parked = makeTask({
      scheduledDate: null,
      bucket: null,
    });
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "task.upsert", payload: { task: parked, ownerId: "priya" } }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "reportDay.upsert",
        payload: {
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          date: "2026-09-08",
          tasks: [],
          slippingCount: 0,
        },
        seq: 2,
      }),
    );

    const next = applyOp(replica, {
      type: "team.task.reorder",
      userId: "priya",
      body: {
        lanes: [
          { scheduledDate: null, bucket: null, taskIds: [] },
          {
            scheduledDate: "2026-09-08",
            bucket: "later",
            taskIds: [parked.id],
          },
        ],
      },
    });

    expect(unscheduledForOwner(next, "priya")).toEqual([]);
    expect(
      next.reportDays[reportDayKey("priya", "2026-09-08")]?.tasks.map((task) => task.id),
    ).toEqual([parked.id]);
  });

  it("keeps a private report task off manager days after reorder", () => {
    const hidden = makeTask({
      id: "99999999-9999-4999-8999-999999999999",
      title: "Private",
      isPrivate: true,
      scheduledDate: "2026-09-07",
      bucket: "later",
    });
    const replica = applyEvent(
      emptyReplica(),
      event({
        type: "reportDay.upsert",
        payload: {
          report: { id: "priya", name: "Priya Raman", email: "priya@egain.com" },
          date: "2026-09-07",
          tasks: [],
          slippingCount: 0,
        },
      }),
    );
    replica.tasks[hidden.id] = hidden;
    replica.owners[hidden.id] = "priya";

    const next = applyOp(replica, {
      type: "team.task.reorder",
      userId: "priya",
      body: {
        lanes: [
          {
            scheduledDate: "2026-09-07",
            bucket: "later",
            taskIds: [hidden.id],
          },
        ],
      },
    });

    expect(
      next.reportDays[reportDayKey("priya", "2026-09-07")]?.tasks.map((task) => task.id),
    ).toEqual([]);
  });
});

describe("tasksForDay", () => {
  it("hides a report's tasks from the manager's own day", () => {
    const own = makeTask({ id: "11111111-1111-4111-8111-111111111111", title: "Mine" });
    const report = makeTask({
      id: "77777777-7777-4777-8777-777777777777",
      title: "Priya's",
    });
    const replica: Replica = {
      ...emptyReplica(),
      viewerId: "marcus",
      tasks: { [own.id]: own, [report.id]: report },
      owners: { [own.id]: "marcus", [report.id]: "priya" },
    };
    expect(tasksForDay(replica, "2026-09-10").map((task) => task.id)).toEqual([
      own.id,
    ]);
  });
});

function notice(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    userId: "priya",
    actorId: "marcus",
    kind: "comment",
    taskId: "11111111-1111-4111-8111-111111111111",
    ownerId: "priya",
    commentId: "22222222-2222-4222-8222-222222222222",
    inboxItemId: null,
    scheduledDate: "2026-09-10",
    taskTitle: "Ship it",
    body: "Marcus commented on Ship it: Looks good",
    readAt: null,
    createdAt: now,
    ...overrides,
  };
}

describe("notification replica", () => {
  it("prepends a notification and counts unread", () => {
    const row = notice();
    const next = applyEvent(
      emptyReplica(),
      event({ type: "notification.upsert", payload: row }),
    );
    expect(next.notifications[0]?.body).toContain("Ship it");
    expect(next.notifications.filter((item) => item.readAt === null)).toHaveLength(1);
  });

  it("marks one notification read from an op", () => {
    const row = notice();
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "notification.upsert", payload: row }),
    );
    replica = applyOp(replica, { type: "notification.read", id: row.id });
    expect(replica.notifications[0]?.readAt).toBeTruthy();
  });

  it("marks every notification read", () => {
    const first = notice();
    const second = notice({
      id: "99999999-9999-4999-8999-999999999999",
      createdAt: "2026-09-10T08:01:00.000Z",
    });
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "notification.upsert", payload: first }),
    );
    replica = applyEvent(
      replica,
      event({ type: "notification.upsert", payload: second, seq: 2 }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "notification.readAll",
        seq: 3,
        payload: { readAt: "2026-09-10T09:00:00.000Z" },
      }),
    );
    expect(replica.notifications.every((item) => item.readAt)).toBe(true);
  });
});

describe("project replica", () => {
  const project = {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "priya",
    name: "EGS",
    color: "ember" as const,
    archivedAt: null,
    isPrivate: false,
    createdAt: now,
    updatedAt: now,
  };

  it("creates a project from an op", () => {
    const next = applyOp(emptyReplica(), {
      type: "project.create",
      id: project.id,
      body: { name: "EGS", color: "ember" },
    });
    expect(next.projects[project.id]?.name).toBe("EGS");
    expect(next.projects[project.id]?.archivedAt).toBeNull();
  });

  it("updates a project name and archives it", () => {
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "project.upsert", payload: project }),
    );
    replica = applyOp(replica, {
      type: "project.update",
      id: project.id,
      patch: { name: "EGS Core", archived: true },
    });
    expect(replica.projects[project.id]?.name).toBe("EGS Core");
    expect(replica.projects[project.id]?.archivedAt).toBeTruthy();
  });

  it("refreshes chips on tasks when a project is renamed", () => {
    const task = makeTask({
      project: {
        id: project.id,
        name: "EGS",
        color: "ember",
        archivedAt: null,
        isPrivate: false,
      },
    });
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "task.upsert", payload: { task, ownerId: "priya" } }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "project.upsert",
        payload: { ...project, name: "EGS Core" },
      }),
    );
    expect(replica.tasks[task.id]?.project?.name).toBe("EGS Core");
  });

  it("keeps chips when a project is archived", () => {
    const task = makeTask({
      project: {
        id: project.id,
        name: "EGS",
        color: "ember",
        archivedAt: null,
        isPrivate: false,
      },
    });
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "task.upsert", payload: { task, ownerId: "priya" } }),
    );
    replica = applyOp(replica, {
      type: "project.update",
      id: project.id,
      patch: { archived: true },
    });
    replica = applyEvent(
      replica,
      event({
        type: "project.upsert",
        payload: { ...project, archivedAt: now },
      }),
    );
    expect(replica.tasks[task.id]?.project?.id).toBe(project.id);
  });

  it("drops chips when a project is deleted", () => {
    const task = makeTask({
      project: {
        id: project.id,
        name: "EGS",
        color: "ember",
        archivedAt: null,
        isPrivate: false,
      },
    });
    let replica = applyEvent(
      emptyReplica(),
      event({ type: "task.upsert", payload: { task, ownerId: "priya" } }),
    );
    replica = applyEvent(
      replica,
      event({ type: "project.upsert", payload: project }),
    );
    replica = applyEvent(
      replica,
      event({ type: "project.delete", payload: { id: project.id } }),
    );
    expect(replica.tasks[task.id]?.project).toBeNull();
    expect(replica.projects[project.id]).toBeUndefined();
  });

  it("stores a report's public project for the manager", () => {
    const replica = applyEvent(
      { ...emptyReplica(), viewerId: "marcus" },
      event({ type: "project.upsert", payload: project }),
    );
    expect(replica.projects[project.id]).toBeUndefined();
    expect(replica.reportProjects.priya?.[project.id]?.name).toBe("EGS");
  });

  it("creates a report project from a manager op", () => {
    const next = applyOp(
      { ...emptyReplica(), viewerId: "marcus" },
      {
        type: "team.project.create",
        id: project.id,
        userId: "priya",
        body: { name: "EGS", color: "ember" },
      },
    );
    expect(next.reportProjects.priya?.[project.id]?.name).toBe("EGS");
    expect(next.reportProjects.priya?.[project.id]?.isPrivate).toBe(false);
  });

  it("removes a report project when it becomes private", () => {
    const task = makeTask({
      project: {
        id: project.id,
        name: "EGS",
        color: "ember",
        archivedAt: null,
        isPrivate: false,
      },
    });
    let replica = applyEvent(
      { ...emptyReplica(), viewerId: "marcus" },
      event({ type: "project.upsert", payload: project }),
    );
    replica = applyEvent(
      replica,
      event({ type: "task.upsert", payload: { task, ownerId: "priya" } }),
    );
    replica = applyEvent(
      replica,
      event({
        type: "project.upsert",
        payload: { ...project, isPrivate: true },
      }),
    );
    expect(replica.reportProjects.priya?.[project.id]).toBeUndefined();
    expect(replica.tasks[task.id]?.project).toBeNull();
  });
});
