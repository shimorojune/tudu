import { describe, expect, it } from "vitest";
import { planRolloverPlacements } from "./rollover.js";

describe("planRolloverPlacements", () => {
  it("preserves bucket and orders by old date at top of lane", () => {
    const placements = planRolloverPlacements({
      toDate: "2026-09-06",
      candidates: [
        {
          id: "a",
          scheduledDate: "2026-09-04",
          bucket: "now",
          position: 1,
          carriedSince: null,
        },
        {
          id: "b",
          scheduledDate: "2026-09-05",
          bucket: "now",
          position: 0,
          carriedSince: null,
        },
        {
          id: "c",
          scheduledDate: "2026-09-05",
          bucket: "later",
          position: 2,
          carriedSince: null,
        },
      ],
    });

    expect(placements).toHaveLength(3);
    expect(placements[0]).toMatchObject({
      taskId: "a",
      bucket: "now",
      position: 0,
      carriedSince: "2026-09-04",
      carriedDays: 2,
    });
    expect(placements[1]).toMatchObject({
      taskId: "b",
      bucket: "now",
      position: 1,
      carriedSince: "2026-09-05",
      carriedDays: 1,
    });
    expect(placements[2]).toMatchObject({
      taskId: "c",
      bucket: "later",
      position: 0,
    });
  });

  it("recomputes carry from existing carriedSince", () => {
    const placements = planRolloverPlacements({
      toDate: "2026-09-06",
      candidates: [
        {
          id: "x",
          scheduledDate: "2026-09-05",
          bucket: "next",
          position: 0,
          carriedSince: "2026-09-01",
        },
      ],
    });

    expect(placements[0]?.carriedDays).toBe(5);
    expect(placements[0]?.carriedSince).toBe("2026-09-01");
  });
});
