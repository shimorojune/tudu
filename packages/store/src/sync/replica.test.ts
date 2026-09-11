import { describe, expect, it } from "vitest";
import type {
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
  tasksForDay,
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
});

describe("applyOp", () => {
  it("creates a task with the client id", () => {
    const id = "66666666-6666-4666-8666-666666666666";
    const next = applyOp(emptyReplica(), {
      type: "task.create",
      id,
      body: {
        title: "New",
        scheduledDate: "2026-09-10",
        bucket: "next",
        startDate: null,
        deadline: null,
        isPrivate: false,
      },
    });
    expect(next.tasks[id]?.title).toBe("New");
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
