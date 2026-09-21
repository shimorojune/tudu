import { describe, expect, it } from "vitest";
import { formatLateReminderBody } from "./reminderWorker.js";

describe("formatLateReminderBody", () => {
  it("formats a single task", () => {
    expect(formatLateReminderBody(["Fix login"])).toContain("1 task slipping");
    expect(formatLateReminderBody(["Fix login"])).toContain("Fix login");
  });

  it("combines multiple tasks with overflow", () => {
    const body = formatLateReminderBody(["A", "B", "C", "D", "E"]);
    expect(body).toContain("5 tasks slipping");
    expect(body).toContain("and 2 more");
  });

  it("returns null for empty titles", () => {
    expect(formatLateReminderBody(["", "  "])).toBeNull();
  });
});
