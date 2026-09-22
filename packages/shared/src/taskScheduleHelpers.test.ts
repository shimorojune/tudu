import { describe, expect, it } from "vitest";
import {
  deadlineFromLocalParts,
  validateStartBeforeDeadline,
} from "./taskScheduleHelpers.js";

describe("taskScheduleHelpers", () => {
  it("builds deadline at local 18:00 for date-only", () => {
    const iso = deadlineFromLocalParts("2026-09-19", 18, 0);
    expect(iso).toMatch(/^2026-09-19T/);
  });

  it("allows same local day when deadline UTC date is earlier", () => {
    const deadlineLocalMidnight = new Date(2026, 8, 23, 0, 3, 0);
    expect(
      validateStartBeforeDeadline(
        "2026-09-23",
        deadlineLocalMidnight.toISOString(),
      ),
    ).toBeNull();
  });

  it("rejects start after deadline day", () => {
    expect(
      validateStartBeforeDeadline(
        "2026-09-20",
        "2026-09-19T18:00:00.000Z",
      ),
    ).toMatch(/deadline/);
    expect(
      validateStartBeforeDeadline(
        "2026-09-19",
        "2026-09-20T18:00:00.000Z",
      ),
    ).toBeNull();
  });
});
