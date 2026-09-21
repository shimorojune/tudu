import { describe, expect, it } from "vitest";
import {
  formatFocusCheckInPresentation,
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
