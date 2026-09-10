import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import { openNowCount } from "./nowCount.js";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Task",
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
    ...overrides,
  };
}

describe("openNowCount", () => {
  it("ignores completed Now tasks", () => {
    const tasks = [
      makeTask({ id: "a", bucket: "now", completedAt: null }),
      makeTask({
        id: "b",
        bucket: "now",
        completedAt: "2026-09-06T10:00:00.000Z",
      }),
      makeTask({ id: "c", bucket: "next", completedAt: null }),
    ];

    expect(openNowCount(tasks)).toBe(1);
  });
});
