import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  canDeliverScheduledReminderPush,
  isWithinQuietHours,
  isWithinWorkingHours,
} from "./notificationTime.js";
import { defaultNotificationPreferences } from "./notificationPreferences.js";

describe("compareAppVersions", () => {
  it("orders semver segments", () => {
    expect(compareAppVersions("0.32.0", "0.31.0")).toBe(1);
    expect(compareAppVersions("0.31.0", "0.32.0")).toBe(-1);
    expect(compareAppVersions("0.31.0", "0.31.0")).toBe(0);
  });
});

describe("isWithinQuietHours", () => {
  it("detects overnight quiet window", () => {
    const prefs = {
      timezone: "UTC",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    };
    const late = new Date("2026-09-19T23:00:00.000Z");
    const morning = new Date("2026-09-19T10:00:00.000Z");
    expect(isWithinQuietHours(prefs, late)).toBe(true);
    expect(isWithinQuietHours(prefs, morning)).toBe(false);
  });
});

describe("isWithinWorkingHours", () => {
  it("blocks weekends when only weekdays are work days", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      workHoursEnabled: true,
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
      workHoursEnabled: true,
      workHoursStart: "09:00",
      workHoursEnd: "18:00",
      workDays: [1, 2, 3, 4, 5],
    };
    const friday = new Date("2026-09-18T12:00:00.000Z");
    expect(isWithinWorkingHours(prefs, friday)).toBe(true);
  });
});

describe("canDeliverScheduledReminderPush", () => {
  it("blocks during quiet hours even on a work day", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      timezone: "UTC",
      workHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    };
    const night = new Date("2026-09-18T23:00:00.000Z");
    expect(canDeliverScheduledReminderPush(prefs, night)).toBe(false);
  });
});
