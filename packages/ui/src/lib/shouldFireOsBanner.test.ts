import { describe, expect, it } from "vitest";
import type { AppNotification } from "@tudu/shared";
import { defaultNotificationPrefs } from "./notificationPrefs";
import { shouldAutoReadNotification, shouldFireOsBanner } from "./shouldFireOsBanner";

const row: AppNotification = {
  id: "88888888-8888-4888-8888-888888888888",
  userId: "priya",
  actorId: "marcus",
  kind: "comment",
  taskId: "task-1",
  ownerId: "priya",
  commentId: "c1",
  inboxItemId: null,
  orgId: null,
  scheduledDate: "2026-09-10",
  jiraIssueId: null,
  jiraIssueKey: null,
  appVersion: null,
  metadata: null,
  taskTitle: "Ship it",
  body: "Marcus commented on Ship it: Looks good",
  readAt: null,
  createdAt: "2026-09-10T08:00:00.000Z",
};

const prefsOn = {
  ...defaultNotificationPrefs,
  osEnabled: true,
};

describe("shouldFireOsBanner", () => {
  it("fires when the window is in the background", () => {
    expect(
      shouldFireOsBanner({
        notification: row,
        prefs: prefsOn,
        windowFocused: false,
        pathname: "/",
        selectedTaskId: row.taskId,
      }),
    ).toBe(true);
  });

  it("skips when that task is already open and focused", () => {
    expect(
      shouldFireOsBanner({
        notification: row,
        prefs: prefsOn,
        windowFocused: true,
        pathname: "/",
        selectedTaskId: row.taskId,
      }),
    ).toBe(false);
  });

  it("skips an inbox row while already on Inbox", () => {
    expect(
      shouldFireOsBanner({
        notification: { ...row, kind: "inbox" },
        prefs: prefsOn,
        windowFocused: true,
        pathname: "/unscheduled",
        selectedTaskId: null,
      }),
    ).toBe(false);
  });

  it("skips a decline banner while already on Inbox", () => {
    expect(
      shouldFireOsBanner({
        notification: { ...row, kind: "inbox_declined" },
        prefs: prefsOn,
        windowFocused: true,
        pathname: "/unscheduled",
        selectedTaskId: null,
      }),
    ).toBe(false);
  });

  it("skips comments when that toggle is off", () => {
    expect(
      shouldFireOsBanner({
        notification: row,
        prefs: { ...prefsOn, eventsComments: false },
        windowFocused: false,
        pathname: "/",
        selectedTaskId: null,
      }),
    ).toBe(false);
  });
});

describe("shouldAutoReadNotification", () => {
  it("marks a comment read when that comments tab is open and focused", () => {
    expect(
      shouldAutoReadNotification({
        notification: row,
        windowFocused: true,
        pathname: "/",
        selectedTaskId: row.taskId,
        inspectorTab: "comments",
      }),
    ).toBe(true);
  });

  it("leaves the badge when the details tab is open instead", () => {
    expect(
      shouldAutoReadNotification({
        notification: row,
        windowFocused: true,
        pathname: "/",
        selectedTaskId: row.taskId,
        inspectorTab: "details",
      }),
    ).toBe(false);
  });

  it("leaves the badge when the window is in the background", () => {
    expect(
      shouldAutoReadNotification({
        notification: row,
        windowFocused: false,
        pathname: "/",
        selectedTaskId: row.taskId,
        inspectorTab: "comments",
      }),
    ).toBe(false);
  });
});
