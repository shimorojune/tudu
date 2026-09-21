import { describe, expect, it } from "vitest";
import {
  applyActivityEnabled,
  applyRemindersEnabled,
  defaultNotificationPreferences,
  deriveActivityEnabled,
  isNotificationKindEnabled,
} from "./notificationPreferences.js";

describe("deriveActivityEnabled", () => {
  it("is true when all activity channels are on", () => {
    expect(deriveActivityEnabled(defaultNotificationPreferences())).toBe(true);
  });

  it("is false when any activity channel is off", () => {
    const prefs = applyActivityEnabled(defaultNotificationPreferences(), false);
    expect(deriveActivityEnabled(prefs)).toBe(false);
    expect(isNotificationKindEnabled(prefs, "comment")).toBe(false);
    expect(isNotificationKindEnabled(prefs, "app_update")).toBe(true);
  });
});

describe("applyRemindersEnabled", () => {
  it("gates all reminder kinds together", () => {
    const off = applyRemindersEnabled(defaultNotificationPreferences(), false);
    expect(isNotificationKindEnabled(off, "reminder_focus")).toBe(false);
    expect(isNotificationKindEnabled(off, "reminder_digest")).toBe(false);
  });
});
