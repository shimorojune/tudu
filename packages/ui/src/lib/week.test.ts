import { describe, expect, it } from "vitest";
import {
  containerForDayBucket,
  defaultWeekId,
  isoWeekId,
  parseIsoWeekId,
  weekDaysFromWeekId,
  weekRangeLabel,
} from "@/lib/week";

describe("week helpers", () => {
  it("round-trips ISO week ids", () => {
    const monday = parseIsoWeekId("2026-W36");
    expect(isoWeekId(monday)).toBe("2026-W36");
  });

  it("returns seven days Mon through Sun", () => {
    const days = weekDaysFromWeekId("2026-W36");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-08-31");
    expect(days[6]).toBe("2026-09-06");
  });

  it("formats a cross-month range label", () => {
    expect(weekRangeLabel("2026-08-31", "2026-09-06")).toBe("31 Aug to 6 Sep");
  });

  it("formats a same-month range label", () => {
    expect(weekRangeLabel("2026-09-07", "2026-09-13")).toBe("7 to 13 Sep");
  });

  it("builds day bucket container ids", () => {
    expect(containerForDayBucket("2026-09-01", "later")).toBe(
      "2026-09-01|later",
    );
  });

  it("defaultWeekId uses effective today", () => {
    const id = defaultWeekId(new Date("2026-09-01T12:00:00"));
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });
});
