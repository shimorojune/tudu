import { describe, expect, it } from "vitest";
import { inProgressForPlacement } from "./inProgressFromBucket.js";

describe("inProgressForPlacement", () => {
  const today = "2026-09-23";

  it("is true for today's Now", () => {
    expect(inProgressForPlacement("now", today, today)).toBe(true);
  });

  it("is false for Now on another day", () => {
    expect(inProgressForPlacement("now", "2026-09-24", today)).toBe(false);
  });

  it("is false for other buckets on today", () => {
    expect(inProgressForPlacement("next", today, today)).toBe(false);
  });
});
