import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import { buildPushCarriedToLaterLanes } from "./pushCarriedToLater.js";

function task(overrides: Partial<Task> & Pick<Task, "id" | "bucket">): Task {
  return {
    id: overrides.id,
    title: overrides.title ?? "Task",
    description: null,
    scheduledDate: overrides.scheduledDate ?? "2026-09-06",
    bucket: overrides.bucket,
    position: overrides.position ?? 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: overrides.carriedDays ?? 0,
    carriedSince: overrides.carriedSince ?? null,
    isPrivate: false,
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:00:00.000Z",
    commentCount: 0,
    project: null,
    subtasks: [],
  };
}

describe("buildPushCarriedToLaterLanes", () => {
  it("moves carried now tasks to the end of later", () => {
    const tasks = [
      task({ id: "a", bucket: "now", position: 0, carriedDays: 1 }),
      task({ id: "b", bucket: "now", position: 1, carriedDays: 0 }),
      task({ id: "c", bucket: "later", position: 0 }),
    ];

    const lanes = buildPushCarriedToLaterLanes({
      tasks,
      scheduledDate: "2026-09-06",
    });

    expect(lanes).toEqual([
      {
        scheduledDate: "2026-09-06",
        bucket: "now",
        taskIds: ["b"],
      },
      {
        scheduledDate: "2026-09-06",
        bucket: "later",
        taskIds: ["c", "a"],
      },
    ]);
  });

  it("returns empty when nothing carried in now", () => {
    const lanes = buildPushCarriedToLaterLanes({
      tasks: [task({ id: "a", bucket: "now", carriedDays: 0 })],
      scheduledDate: "2026-09-06",
    });
    expect(lanes).toEqual([]);
  });
});
