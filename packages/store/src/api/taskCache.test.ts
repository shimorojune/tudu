import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import {
  appendOptimisticSubtask,
  mergeTaskPatch,
  reorderSubtasksInTask,
  syncTaskToDayCache,
} from "./taskCache.js";

const thursday = "2026-09-10";
const friday = "2026-09-11";

function makeTask(overrides: Partial<Task> & Pick<Task, "id" | "title" | "scheduledDate">): Task {
  return {
    description: null,
    bucket: "later",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    commentCount: 0,
    subtasks: [],
    ...overrides,
  };
}

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Parent",
  description: null,
  scheduledDate: "2026-09-06",
  bucket: "now",
  position: 0,
  startDate: null,
  deadline: null,
  completedAt: null,
  inProgress: false,
  carriedDays: 0,
  carriedSince: null,
  isPrivate: false,
  createdAt: "2026-09-06T08:00:00.000Z",
  updatedAt: "2026-09-06T08:00:00.000Z",
  commentCount: 0,
  subtasks: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      taskId: "11111111-1111-4111-8111-111111111111",
      title: "One",
      done: false,
      position: 0,
      createdAt: "2026-09-06T08:00:00.000Z",
      updatedAt: "2026-09-06T08:00:00.000Z",
    },
  ],
};

describe("appendOptimisticSubtask", () => {
  it("appends a temp subtask with the typed title", () => {
    const next = appendOptimisticSubtask(task, { title: "fix the bug" }, "temp-id");
    const added = next.subtasks[1];

    expect(next.subtasks).toHaveLength(2);
    expect(added?.id).toBe("temp-id");
    expect(added?.title).toBe("fix the bug");
    expect(added?.done).toBe(false);
    expect(added?.position).toBe(1);
  });
});

describe("reorderSubtasksInTask", () => {
  it("reorders subtasks and reassigns positions", () => {
    const next = reorderSubtasksInTask(task, [
      "22222222-2222-4222-8222-222222222222",
    ]);

    expect(next.subtasks.map((subtask) => subtask.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(next.subtasks[0]?.position).toBe(0);
  });
});

describe("mergeTaskPatch", () => {
  it("moves a completed task to the lane end and clears in progress", () => {
    const lane = [
      task,
      makeTask({
        id: "33333333-3333-4333-8333-333333333333",
        title: "Second",
        scheduledDate: "2026-09-06",
        bucket: "now",
        position: 1,
      }),
    ];
    const completing = { ...task, inProgress: true, position: 0 };

    const next = mergeTaskPatch(completing, { completed: true }, lane);

    expect(next.completedAt).not.toBeNull();
    expect(next.inProgress).toBe(false);
    expect(next.position).toBe(2);
  });

  it("keeps position when uncompleting", () => {
    const completed = {
      ...task,
      completedAt: "2026-09-06T10:00:00.000Z",
      position: 4,
    };

    const next = mergeTaskPatch(completed, { completed: false }, [task]);

    expect(next.completedAt).toBeNull();
    expect(next.position).toBe(4);
  });
});

describe("syncTaskToDayCache", () => {
  it("removes a task from the wrong day and upserts it on the matching day", () => {
    const thursdayTask = makeTask({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Thursday only",
      scheduledDate: thursday,
    });
    const fridayTask = makeTask({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Friday task",
      scheduledDate: friday,
      subtasks: [
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          taskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Sub",
          done: false,
          position: 0,
          createdAt: "2026-09-11T08:00:00.000Z",
          updatedAt: "2026-09-11T08:00:00.000Z",
        },
      ],
    });

    const pollutedThursday = [thursdayTask, fridayTask];
    const cleanedThursday = syncTaskToDayCache(pollutedThursday, fridayTask, thursday);
    const fridayCache = syncTaskToDayCache([], fridayTask, friday);

    expect(cleanedThursday).toHaveLength(1);
    expect(cleanedThursday[0]?.id).toBe(thursdayTask.id);
    expect(fridayCache).toHaveLength(1);
    expect(fridayCache[0]?.id).toBe(fridayTask.id);
    expect(cleanedThursday.some((entry) => entry.id === fridayTask.id)).toBe(false);
  });
});
