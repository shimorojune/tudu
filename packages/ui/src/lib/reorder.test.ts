import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import {
  applyLanesToTasks,
  buildPullIntoNowLanes,
  buildReorderLanes,
  moveTaskToBucketLanes,
  unscheduleTaskLanes,
} from "./reorder";

function makeTask(
  id: string,
  bucket: "now" | "next" | "later" | null,
  position: number,
  scheduledDate: string | null = "2026-09-06",
): Task {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    scheduledDate,
    bucket,
    position,
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
  };
}

describe("buildReorderLanes", () => {
  it("reorders within one bucket", () => {
    const tasks = [
      makeTask("a", "now", 0),
      makeTask("b", "now", 1),
      makeTask("c", "now", 2),
    ];

    const lanes = buildReorderLanes({
      tasks,
      activeId: "c",
      target: { scheduledDate: "2026-09-06", bucket: "now" },
      targetIndex: 0,
    });

    expect(lanes).toEqual([
      {
        scheduledDate: "2026-09-06",
        bucket: "now",
        taskIds: ["c", "a", "b"],
      },
    ]);
  });

  it("moves across buckets on the same day", () => {
    const tasks = [
      makeTask("a", "now", 0),
      makeTask("b", "next", 0),
      makeTask("c", "next", 1),
    ];

    const lanes = buildReorderLanes({
      tasks,
      activeId: "a",
      target: { scheduledDate: "2026-09-06", bucket: "next" },
      targetIndex: 1,
    });

    expect(lanes).toEqual([
      { scheduledDate: "2026-09-06", bucket: "now", taskIds: [] },
      { scheduledDate: "2026-09-06", bucket: "next", taskIds: ["b", "a", "c"] },
    ]);
  });

  it("moves into an empty bucket", () => {
    const tasks = [makeTask("a", "later", 0)];

    const lanes = buildReorderLanes({
      tasks,
      activeId: "a",
      target: { scheduledDate: "2026-09-06", bucket: "now" },
      targetIndex: 0,
    });

    expect(lanes).toEqual([
      { scheduledDate: "2026-09-06", bucket: "later", taskIds: [] },
      { scheduledDate: "2026-09-06", bucket: "now", taskIds: ["a"] },
    ]);
  });

  it("preview round-trip moves a task across buckets", () => {
    const tasks = [
      makeTask("a", "now", 0),
      makeTask("b", "next", 0),
      makeTask("c", "next", 1),
    ];

    const lanes = buildReorderLanes({
      tasks,
      activeId: "a",
      target: { scheduledDate: "2026-09-06", bucket: "next" },
      targetIndex: 1,
    });

    const preview = applyLanesToTasks(tasks, lanes);

    expect(
      preview
        .filter((task) => task.bucket === "next")
        .sort((a, b) => a.position - b.position)
        .map((task) => task.id),
    ).toEqual(["b", "a", "c"]);
    expect(preview.find((task) => task.id === "a")?.bucket).toBe("next");
    expect(
      preview.filter((task) => task.bucket === "now").map((task) => task.id),
    ).toEqual([]);
  });
});

describe("buildPullIntoNowLanes", () => {
  it("moves the first Next task into Now", () => {
    const tasks = [
      makeTask("a", "now", 0),
      makeTask("b", "next", 0),
      makeTask("c", "next", 1),
    ];

    expect(buildPullIntoNowLanes(tasks, "2026-09-06")).toEqual([
      { scheduledDate: "2026-09-06", bucket: "now", taskIds: ["a", "b"] },
      { scheduledDate: "2026-09-06", bucket: "next", taskIds: ["c"] },
    ]);
  });
});

describe("moveTaskToBucketLanes", () => {
  it("appends to the target bucket", () => {
    const tasks = [
      makeTask("a", "later", 0),
      makeTask("b", "now", 0),
    ];

    const lanes = moveTaskToBucketLanes(tasks, "a", "now", "2026-09-06");
    expect(lanes).toEqual([
      { scheduledDate: "2026-09-06", bucket: "later", taskIds: [] },
      { scheduledDate: "2026-09-06", bucket: "now", taskIds: ["b", "a"] },
    ]);
  });
});

describe("unscheduleTaskLanes", () => {
  it("sends a task to the backlog lane", () => {
    const tasks = [makeTask("a", "later", 0)];

    const lanes = unscheduleTaskLanes(tasks, "a");
    expect(lanes).toEqual([
      { scheduledDate: "2026-09-06", bucket: "later", taskIds: [] },
      { scheduledDate: null, bucket: null, taskIds: ["a"] },
    ]);
  });
});
