import type { Task } from "@tudu/shared";
import { describe, expect, it } from "vitest";
import {
  compareCompletedTasks,
  splitOpenAndCompleted,
  tasksByBucketOpen,
} from "./completedTasks";

function makeTask(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
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
    subtasks: [],
    commentCount: 0,
    project: null,
    jiraLinks: [],
    ...overrides,
  };
}

describe("splitOpenAndCompleted", () => {
  it("partitions by completedAt and sorts completed newest first", () => {
    const open = makeTask({ id: "11111111-1111-4111-8111-111111111111", title: "Open" });
    const older = makeTask({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Old done",
      completedAt: "2026-09-06T08:00:00.000Z",
    });
    const newer = makeTask({
      id: "33333333-3333-4333-8333-333333333333",
      title: "New done",
      completedAt: "2026-09-06T12:00:00.000Z",
    });

    const result = splitOpenAndCompleted([older, open, newer]);

    expect(result.open).toEqual([open]);
    expect(result.completed.map((task) => task.id)).toEqual([
      "33333333-3333-4333-8333-333333333333",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});

describe("compareCompletedTasks", () => {
  it("breaks ties by title", () => {
    const a = makeTask({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Beta",
      completedAt: "2026-09-06T10:00:00.000Z",
    });
    const b = makeTask({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Alpha",
      completedAt: "2026-09-06T10:00:00.000Z",
    });

    expect(compareCompletedTasks(a, b)).toBeGreaterThan(0);
  });
});

describe("tasksByBucketOpen", () => {
  it("skips completed tasks", () => {
    const done = makeTask({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Done",
      bucket: "now",
      completedAt: "2026-09-06T10:00:00.000Z",
    });
    const open = makeTask({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Open",
      bucket: "now",
    });

    const grouped = tasksByBucketOpen([done, open]);

    expect(grouped.now).toEqual([open]);
    expect(grouped.next).toEqual([]);
  });
});
