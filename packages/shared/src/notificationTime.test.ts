import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  isWithinWorkingHours,
  listRegularSlotStartsForDay,
  nextRegularSlotStart,
  regularSlotAt,
} from "./notificationTime.js";
import { defaultNotificationPreferences } from "./notificationPreferences.js";

describe("compareAppVersions", () => {
  it("orders semver segments", () => {
    expect(compareAppVersions("0.32.0", "0.31.0")).toBe(1);
    expect(compareAppVersions("0.31.0", "0.32.0")).toBe(-1);
    expect(compareAppVersions("0.31.0", "0.31.0")).toBe(0);
  });
});

describe("isWithinWorkingHours", () => {
  it("blocks weekends when only weekdays are work days", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      workHoursStart: "09:00",
      workHoursEnd: "18:00",
      workDays: [1, 2, 3, 4, 5],
    };
    const saturday = new Date("2026-09-19T12:00:00.000Z");
    expect(isWithinWorkingHours(prefs, saturday)).toBe(false);
  });

  it("allows midday on a work day", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      workHoursStart: "09:00",
      workHoursEnd: "18:00",
      workDays: [1, 2, 3, 4, 5],
    };
    const friday = new Date("2026-09-18T12:00:00.000Z");
    expect(isWithinWorkingHours(prefs, friday)).toBe(true);
  });
});

describe("regularSlotAt", () => {
  it("returns the active slot for a 30 minute cadence", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      regularIntervalMinutes: 30,
      workHoursStart: "09:00",
      workHoursEnd: "18:00",
      workDays: [1, 2, 3, 4, 5],
    };
    const friday = new Date("2026-09-18T09:17:00.000Z");
    const slot = regularSlotAt(prefs, friday);
    expect(slot?.slotHm).toBe("09:00");
  });

  it("returns null outside working hours", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      workHoursStart: "09:00",
      workHoursEnd: "18:00",
      workDays: [1, 2, 3, 4, 5],
    };
    const night = new Date("2026-09-18T23:00:00.000Z");
    expect(regularSlotAt(prefs, night)).toBeNull();
  });
});

describe("listRegularSlotStartsForDay", () => {
  it("lists slots strictly before work end", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      regularIntervalMinutes: 60,
      workHoursStart: "09:00",
      workHoursEnd: "12:00",
    };
    expect(listRegularSlotStartsForDay(prefs)).toEqual([9 * 60, 10 * 60, 11 * 60]);
  });
});

describe("nextRegularSlotStart", () => {
  it("returns the next boundary after now", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      regularIntervalMinutes: 30,
      workHoursStart: "09:00",
      workHoursEnd: "18:00",
      workDays: [1, 2, 3, 4, 5],
    };
    const friday = new Date("2026-09-18T09:17:00.000Z");
    const next = nextRegularSlotStart(prefs, friday);
    expect(next.getTime()).toBeGreaterThan(friday.getTime());
  });
});
