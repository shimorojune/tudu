import { describe, expect, it } from "vitest";
import {
  defaultNotificationPreferences,
  isNotificationKindEnabled,
  nearestRegularIntervalMinutes,
  notificationPreferencesSchema,
} from "./notificationPreferences.js";

describe("isNotificationKindEnabled", () => {
  it("gates event kinds by source toggles", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      eventsEnabled: true,
      eventsJira: false,
      eventsInbox: true,
      eventsComments: true,
    };
    expect(isNotificationKindEnabled(prefs, "jira_assigned")).toBe(false);
    expect(isNotificationKindEnabled(prefs, "inbox")).toBe(true);
    expect(isNotificationKindEnabled(prefs, "comment")).toBe(true);
    expect(isNotificationKindEnabled(prefs, "task_changed")).toBe(true);
  });

  it("blocks all events when master is off", () => {
    const prefs = {
      ...defaultNotificationPreferences(),
      eventsEnabled: false,
    };
    expect(isNotificationKindEnabled(prefs, "inbox")).toBe(false);
    expect(isNotificationKindEnabled(prefs, "app_update")).toBe(false);
  });
});

describe("notificationPreferencesSchema", () => {
  it("rejects work hours when start is not before end", () => {
    const result = notificationPreferencesSchema.safeParse({
      ...defaultNotificationPreferences(),
      workHoursStart: "18:00",
      workHoursEnd: "09:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("nearestRegularIntervalMinutes", () => {
  it("picks the closest allowed interval", () => {
    expect(nearestRegularIntervalMinutes(90)).toBe(60);
    expect(nearestRegularIntervalMinutes(100)).toBe(120);
    expect(nearestRegularIntervalMinutes(20)).toBe(15);
  });
});
