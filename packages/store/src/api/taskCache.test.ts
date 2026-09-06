import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import { appendOptimisticSubtask, reorderSubtasksInTask } from "./taskCache.js";

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Parent",
  scheduledDate: "2026-09-06",
  bucket: "now",
  position: 0,
  startDate: null,
  deadline: null,
  completedAt: null,
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
