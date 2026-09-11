import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import { groupProjectTasks } from "./projectGroups.js";

function task(overrides: Partial<Task>): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Ship",
    description: null,
    scheduledDate: "2026-09-11",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-11T08:00:00.000Z",
    updatedAt: "2026-09-11T08:00:00.000Z",
    commentCount: 0,
    project: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "EGS",
      color: "ember",
      archivedAt: null,
      isPrivate: false,
    },
    subtasks: [],
    ...overrides,
  };
}

describe("groupProjectTasks", () => {
  it("groups open work by day, then Unscheduled, then Done", () => {
    const groups = groupProjectTasks([
      task({
        id: "a",
        title: "Done one",
        completedAt: "2026-09-10T10:00:00.000Z",
      }),
      task({ id: "b", title: "Loose", scheduledDate: null, bucket: null }),
      task({ id: "c", title: "Friday", scheduledDate: "2026-09-11" }),
      task({ id: "d", title: "Thursday", scheduledDate: "2026-09-10" }),
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "unscheduled",
      "done",
    ]);
    expect(groups[2]?.tasks[0]?.title).toBe("Loose");
    expect(groups[3]?.tasks[0]?.title).toBe("Done one");
  });
});
