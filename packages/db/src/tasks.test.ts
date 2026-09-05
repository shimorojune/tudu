import { describe, expect, it } from "vitest";
import { planReorder } from "./tasks.js";

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
