import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultNotificationPrefs,
  readNotificationPrefs,
  writeNotificationPrefs,
} from "./notificationPrefs";

describe("notificationPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults banners off and events on", () => {
    expect(readNotificationPrefs()).toEqual(defaultNotificationPrefs);
    expect(defaultNotificationPrefs.osEnabled).toBe(false);
    expect(defaultNotificationPrefs.eventsEnabled).toBe(true);
    expect(defaultNotificationPrefs.eventsInbox).toBe(true);
    expect(defaultNotificationPrefs.eventsComments).toBe(true);
  });

  it("round-trips stored toggles", () => {
    writeNotificationPrefs({
      ...defaultNotificationPrefs,
      osEnabled: true,
      eventsInbox: false,
      eventsComments: true,
      eventsJira: true,
    });
    expect(readNotificationPrefs()).toEqual({
      ...defaultNotificationPrefs,
      osEnabled: true,
      eventsInbox: false,
      eventsComments: true,
      eventsJira: true,
    });
  });
});
