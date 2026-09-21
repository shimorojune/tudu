import { describe, expect, it } from "vitest";
import {
  formatFocusCheckInPresentation,
  formatWorkCheckInPresentation,
  focusSnapshotHash,
} from "./notificationPresentation.js";

describe("formatFocusCheckInPresentation", () => {
  it("describes empty in-progress state", () => {
    const result = formatFocusCheckInPresentation([]);
    expect(result.title).toBe("Nothing in progress");
    expect(result.summary).toContain("Today");
  });

  it("describes a single task", () => {
    const result = formatFocusCheckInPresentation(["Ship billing"]);
    expect(result.title).toBe("In progress");
    expect(result.lines[0]).toBe("Ship billing");
  });

  it("lists multiple tasks", () => {
    const result = formatFocusCheckInPresentation(["A", "B"]);
    expect(result.title).toBe("2 things in progress");
    expect(result.lines).toHaveLength(2);
  });
});

describe("focusSnapshotHash", () => {
  it("is stable regardless of order", () => {
    expect(focusSnapshotHash(["b", "a"])).toBe(focusSnapshotHash(["a", "b"]));
  });
});

describe("formatWorkCheckInPresentation", () => {
  it("combines in progress, next up, and slipping", () => {
    const result = formatWorkCheckInPresentation({
      inProgress: ["Ship billing"],
      nextUp: "Write docs",
      slippingCount: 2,
      nearestDeadlineHours: 4,
      nearestDeadlineTitle: "Tax filing",
    });
    expect(result.title).toBe("Work check-in");
    expect(result.lines.join(" ")).toContain("In progress");
    expect(result.lines.join(" ")).toContain("Next up");
    expect(result.lines.join(" ")).toContain("2 tasks slipping");
    expect(result.lines.join(" ")).toContain("Due in 4h");
  });
});
