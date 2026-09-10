import { describe, expect, it } from "vitest";
import { taskRowPersistableChanged } from "./activity.js";
import type { TaskRow } from "./tasks-schema.js";

function baseRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task-1",
    userId: "user-1",
    title: "Example",
    description: null,
    scheduledDate: "2026-09-10",
    bucket: "later",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: new Date("2026-09-10T08:00:00Z"),
    updatedAt: new Date("2026-09-10T08:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("taskRowPersistableChanged", () => {
  it("detects inProgress-only changes", () => {
    const before = baseRow();
    const after = baseRow({ inProgress: true });

    expect(taskRowPersistableChanged(before, after)).toBe(true);
  });

  it("returns false when rows match", () => {
    const row = baseRow();

    expect(taskRowPersistableChanged(row, row)).toBe(false);
  });
});
