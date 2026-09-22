import { describe, expect, it } from "vitest";
import {
  assertOpenNowCountWithinCap,
  canPlaceInNow,
  countOpenNowOnDate,
  NowCapExceededError,
  openNowCountAfterPlacements,
} from "./nowCap.js";

const today = "2026-09-22";

function task(
  id: string,
  bucket: "now" | "next" | "later" | null,
  scheduledDate: string | null,
  completedAt: string | null = null,
) {
  return { id, bucket, scheduledDate, completedAt };
}

describe("countOpenNowOnDate", () => {
  it("counts only open tasks in Now on the given date", () => {
    const tasks = [
      task("a", "now", today),
      task("b", "now", today, "2026-09-22T10:00:00.000Z"),
      task("c", "now", "2026-09-23"),
      task("d", "next", today),
    ];
    expect(countOpenNowOnDate(tasks, today)).toBe(1);
  });
});

describe("canPlaceInNow", () => {
  it("allows non-today Now lanes", () => {
    expect(
      canPlaceInNow({
        today,
        targetDate: "2026-09-23",
        targetBucket: "now",
        openNowCountOnToday: 5,
      }),
    ).toBe(true);
  });

  it("allows reorder within today's Now when full", () => {
    expect(
      canPlaceInNow({
        today,
        targetDate: today,
        targetBucket: "now",
        openNowCountOnToday: 5,
        currentScheduledDate: today,
        currentBucket: "now",
      }),
    ).toBe(true);
  });

  it("blocks a sixth task entering today's Now", () => {
    expect(
      canPlaceInNow({
        today,
        targetDate: today,
        targetBucket: "now",
        openNowCountOnToday: 5,
        currentBucket: "next",
        currentScheduledDate: today,
      }),
    ).toBe(false);
  });
});

describe("openNowCountAfterPlacements", () => {
  it("throws when reorder would exceed the cap", () => {
    const beforeTasks = [
      task("1", "now", today),
      task("2", "now", today),
      task("3", "now", today),
      task("4", "now", today),
      task("5", "now", today),
      task("6", "next", today),
    ];
    const placements = [
      {
        taskId: "6",
        scheduledDate: today,
        bucket: "now" as const,
      },
    ];

    expect(() =>
      assertOpenNowCountWithinCap({ today, beforeTasks, placements }),
    ).toThrow(NowCapExceededError);

    expect(
      openNowCountAfterPlacements({ today, beforeTasks, placements }),
    ).toBe(6);
  });
});
