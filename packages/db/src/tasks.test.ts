import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { notPendingInbox, planReorder, planSubtaskReorder } from "./tasks.js";
import { tasks } from "./tasks-schema.js";

describe("planReorder", () => {
  it("numbers a lane contiguously from zero", () => {
    const placements = planReorder([
      { scheduledDate: "2026-09-05", bucket: "now", taskIds: ["a", "b", "c"] },
    ]);

    expect(placements.map((placement) => placement.position)).toEqual([0, 1, 2]);
  });

  it("moves a task across buckets on the same day", () => {
    const placements = planReorder([
      { scheduledDate: "2026-09-05", bucket: "now", taskIds: ["a"] },
      { scheduledDate: "2026-09-05", bucket: "next", taskIds: ["b", "c"] },
    ]);

    expect(placements).toEqual([
      { taskId: "a", scheduledDate: "2026-09-05", bucket: "now", position: 0 },
      { taskId: "b", scheduledDate: "2026-09-05", bucket: "next", position: 0 },
      { taskId: "c", scheduledDate: "2026-09-05", bucket: "next", position: 1 },
    ]);
  });

  it("schedules a task out of the backlog into a day", () => {
    const placements = planReorder([
      { scheduledDate: null, bucket: null, taskIds: ["b"] },
      { scheduledDate: "2026-09-05", bucket: "now", taskIds: ["a"] },
    ]);

    expect(placements[0]).toEqual({
      taskId: "b",
      scheduledDate: null,
      bucket: null,
      position: 0,
    });
    expect(placements[1]?.bucket).toBe("now");
  });

  it("refuses the same task in two lanes", () => {
    expect(() =>
      planReorder([
        { scheduledDate: "2026-09-05", bucket: "now", taskIds: ["a"] },
        { scheduledDate: "2026-09-05", bucket: "next", taskIds: ["a"] },
      ]),
    ).toThrow();
  });
});

describe("planSubtaskReorder", () => {
  const liveIds = ["a", "b", "c"];

  it("numbers subtasks contiguously from zero", () => {
    const placements = planSubtaskReorder(["c", "a", "b"], liveIds);

    expect(placements).toEqual(
      new Map([
        ["c", 0],
        ["a", 1],
        ["b", 2],
      ]),
    );
  });

  it("returns null when an id is unknown", () => {
    expect(planSubtaskReorder(["a", "d"], liveIds)).toBeNull();
  });

  it("returns null when the list length does not match", () => {
    expect(planSubtaskReorder(["a"], liveIds)).toBeNull();
  });
});

describe("notPendingInbox", () => {
  it("qualifies inbox_items.task_id, not tasks.task_id", () => {
    const qb = new QueryBuilder();
    const { sql } = qb
      .select({ id: tasks.id })
      .from(tasks)
      .where(notPendingInbox())
      .toSQL();

    expect(sql).toContain('"inbox_items"."task_id"');
    expect(sql).toContain('"inbox_items"."status"');
    expect(sql).not.toContain('"tasks"."task_id"');
  });
});
