import { describe, expect, it } from "vitest";
import { formatLateReminderBody } from "./reminderWorker.js";

describe("formatLateReminderBody", () => {
  it("formats a single task", () => {
    expect(formatLateReminderBody(["Fix login"])).toBe("Running late: Fix login");
  });

  it("combines multiple tasks with overflow", () => {
    expect(
      formatLateReminderBody(["A", "B", "C", "D", "E"]),
    ).toBe("Running late: A, B, C, and 2 more");
  });

  it("returns null for empty titles", () => {
    expect(formatLateReminderBody(["", "  "])).toBeNull();
  });
});
