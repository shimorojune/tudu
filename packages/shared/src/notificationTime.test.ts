import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  isWithinQuietHours,
} from "./notificationTime.js";

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
