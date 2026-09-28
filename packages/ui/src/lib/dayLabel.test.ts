import { describe, expect, it } from "vitest";
import { dayTabLabel, dayTabSubLabel } from "./dayLabel";

describe("dayTabLabel", () => {
  it("names the three days around today", () => {
    expect(dayTabLabel("2026-09-05", "2026-09-05")).toBe("Today");
    expect(dayTabLabel("2026-09-06", "2026-09-05")).toBe("Tomorrow");
    expect(dayTabLabel("2026-09-04", "2026-09-05")).toBe("Yesterday");
  });

  it("uses effective today after calendar midnight before day start", () => {
    const effectiveToday = "2026-09-25";
    const calendarToday = "2026-09-26";
    expect(dayTabLabel(effectiveToday, effectiveToday)).toBe("Today");
    expect(dayTabLabel(effectiveToday, calendarToday)).toBe("Yesterday");
  });

  it("falls back to a short date further out", () => {
    expect(dayTabLabel("2026-09-09", "2026-09-05")).toBe("Wed 9 Sep");
    expect(dayTabLabel("2026-08-28", "2026-09-05")).toBe("Fri 28 Aug");
  });

  it("crosses month boundaries", () => {
    expect(dayTabLabel("2026-10-01", "2026-09-30")).toBe("Tomorrow");
    expect(dayTabLabel("2026-09-30", "2026-10-01")).toBe("Yesterday");
  });

  it("crosses year boundaries", () => {
    expect(dayTabLabel("2027-01-01", "2026-12-31")).toBe("Tomorrow");
    expect(dayTabLabel("2026-12-31", "2027-01-01")).toBe("Yesterday");
  });
});

describe("dayTabSubLabel", () => {
  const today = "2026-09-05";

  it("shows the date line on today and relative days", () => {
    expect(dayTabSubLabel(today, today)).toBe("Sat 5 Sep");
    expect(dayTabSubLabel("2026-09-06", today)).toBe("Sun 6 Sep");
    expect(dayTabSubLabel("2026-09-04", today)).toBe("Fri 4 Sep");
  });

  it("shows distance further out", () => {
    expect(dayTabSubLabel("2026-09-09", today)).toBe("in 4 days");
    expect(dayTabSubLabel("2026-08-28", today)).toBe("8 days ago");
  });
});
