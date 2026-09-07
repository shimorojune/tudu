import { describe, expect, it } from "vitest";
import {
  calendarDayIso,
  carriedDaysBetween,
  DAY_START_HOUR,
  effectiveDayIso,
  isMidnightBoundary,
  isSlipping,
  SLIPPING_CARRY_DAYS,
} from "./day.js";

describe("effectiveDayIso", () => {
  it("returns yesterday before day start hour", () => {
    const now = new Date(2026, 8, 6, DAY_START_HOUR - 1, 30);
    expect(effectiveDayIso(now)).toBe("2026-09-05");
  });

  it("returns today at day start hour", () => {
    const now = new Date(2026, 8, 6, DAY_START_HOUR, 0);
    expect(effectiveDayIso(now)).toBe("2026-09-06");
  });
});

describe("carriedDaysBetween", () => {
  it("counts inclusive day span", () => {
    expect(carriedDaysBetween("2026-09-01", "2026-09-06")).toBe(5);
  });
});

describe("isSlipping", () => {
  it("is false below carry threshold without deadline", () => {
    expect(isSlipping({ carriedDays: 1, deadline: null })).toBe(false);
  });

  it("is true at carry threshold", () => {
    expect(
      isSlipping({ carriedDays: SLIPPING_CARRY_DAYS, deadline: null }),
    ).toBe(true);
  });

  it("is true when deadline passed", () => {
    const now = new Date("2026-09-06T12:00:00");
    expect(
      isSlipping({
        carriedDays: 0,
        deadline: "2026-09-05T18:00:00.000Z",
        now,
      }),
    ).toBe(true);
  });
});

describe("isMidnightBoundary", () => {
  it("is true after midnight before day start when calendar advanced", () => {
    const now = new Date(2026, 8, 7, 1, 0);
    expect(isMidnightBoundary({ selectedDate: "2026-09-06", now })).toBe(true);
  });

  it("is false after day start hour", () => {
    const now = new Date(2026, 8, 7, DAY_START_HOUR, 0);
    expect(isMidnightBoundary({ selectedDate: "2026-09-06", now })).toBe(false);
  });
});

describe("calendarDayIso", () => {
  it("uses wall clock date", () => {
    const now = new Date(2026, 8, 7, 1, 0);
    expect(calendarDayIso(now)).toBe("2026-09-07");
  });
});
