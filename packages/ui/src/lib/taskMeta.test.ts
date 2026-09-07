import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import { taskMetaSegments } from "./taskMeta.js";

function baseTask(overrides: Partial<Task> = {}): Task {
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
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:00:00.000Z",
    commentCount: 0,
    subtasks: [],
    ...overrides,
  };
}

describe("taskMetaSegments", () => {
  it("does not include carried days text", () => {
    const segments = taskMetaSegments(
      baseTask({ carriedDays: 3 }),
      "2026-09-06",
    );
    expect(segments.some((segment) => segment.kind === "text" && segment.text.includes("carried"))).toBe(
      false,
    );
  });

  it("shows overdue deadline with accent", () => {
    const now = new Date("2026-09-06T15:00:00");
    const segments = taskMetaSegments(
      baseTask({ deadline: "2026-09-05T10:00:00.000Z" }),
      "2026-09-06",
      now,
    );
    const deadline = segments.find((segment) => segment.kind === "text");
    expect(deadline?.kind).toBe("text");
    if (deadline?.kind === "text") {
      expect(deadline.text).toMatch(/^overdue, was due \d{2}:\d{2}$/);
      expect(deadline.accent).toBe(true);
    }
  });
});
