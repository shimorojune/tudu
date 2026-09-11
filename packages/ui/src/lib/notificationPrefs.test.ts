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

  it("defaults banners off and kinds on", () => {
    expect(readNotificationPrefs()).toEqual(defaultNotificationPrefs);
    expect(defaultNotificationPrefs.osEnabled).toBe(false);
    expect(defaultNotificationPrefs.inbox).toBe(true);
    expect(defaultNotificationPrefs.comments).toBe(true);
    expect(defaultNotificationPrefs.taskChanges).toBe(true);
  });

  it("round-trips stored toggles", () => {
    writeNotificationPrefs({
      osEnabled: true,
      inbox: false,
      comments: true,
      taskChanges: false,
    });
    expect(readNotificationPrefs()).toEqual({
      osEnabled: true,
      inbox: false,
      comments: true,
      taskChanges: false,
    });
  });
});
