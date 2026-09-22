import { describe, expect, it } from "vitest";
import { lanesExceedNowCap } from "./nowCapGuard.js";

const today = "2026-09-22";

describe("lanesExceedNowCap", () => {
  it("detects when a reorder would overflow today's Now", () => {
    const beforeTasks = [
      {
        id: "1",
        bucket: "now" as const,
        scheduledDate: today,
        completedAt: null,
      },
      {
        id: "2",
        bucket: "now" as const,
        scheduledDate: today,
        completedAt: null,
      },
      {
        id: "3",
        bucket: "now" as const,
        scheduledDate: today,
        completedAt: null,
      },
      {
        id: "4",
        bucket: "now" as const,
        scheduledDate: today,
        completedAt: null,
      },
      {
        id: "5",
        bucket: "now" as const,
        scheduledDate: today,
        completedAt: null,
      },
      {
        id: "6",
        bucket: "next" as const,
        scheduledDate: today,
        completedAt: null,
      },
    ];

    const lanes = [
      {
        scheduledDate: today,
        bucket: "now" as const,
        taskIds: ["1", "2", "3", "4", "5", "6"],
      },
      {
        scheduledDate: today,
        bucket: "next" as const,
        taskIds: [],
      },
    ];

    expect(lanesExceedNowCap(beforeTasks, lanes, today)).toBe(true);
  });
});
