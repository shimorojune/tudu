import { describe, expect, it } from "vitest";
import {
  clipNotificationText,
  formatNotificationBody,
  isTaskChangeTimelineType,
  notificationActorLabel,
} from "./notifications.js";

describe("formatNotificationBody", () => {
  it("includes the task title on an inbox send", () => {
    expect(
      formatNotificationBody({
        kind: "inbox",
        actorName: "Marcus Bell",
        taskTitle: "Write up capacity risks for Q4 planning",
      }),
    ).toBe("Marcus sent you a task: Write up capacity risks for Q4 planning");
  });

  it("includes the task title and a short comment quote", () => {
    expect(
      formatNotificationBody({
        kind: "comment",
        actorName: "Priya Shah",
        taskTitle: "Ship it",
        commentQuote: "Looks good",
      }),
    ).toBe("Priya commented on Ship it: Looks good");
  });

  it("returns null when the task has no title", () => {
    expect(
      formatNotificationBody({
        kind: "comment",
        actorName: "Marcus Bell",
        taskTitle: "   ",
        commentQuote: "Hello",
      }),
    ).toBeNull();
  });

  it("clips a long title and a long quote", () => {
    const title = "A".repeat(60);
    const quote = "B".repeat(90);
    const body = formatNotificationBody({
      kind: "comment",
      actorName: "Marcus Bell",
      taskTitle: title,
      commentQuote: quote,
    });
    expect(body).toContain("...");
    expect(body?.includes(title)).toBe(false);
    expect(clipNotificationText(title, 48).endsWith("...")).toBe(true);
  });

  it("includes the task title and reason on a decline", () => {
    expect(
      formatNotificationBody({
        kind: "inbox_declined",
        actorName: "Test User",
        taskTitle: "Live inbox ping",
        commentQuote: "Need this next week",
      }),
    ).toBe("Test declined Live inbox ping: Need this next week");
  });

  it("names a deleted task", () => {
    expect(
      formatNotificationBody({
        kind: "task_deleted",
        actorName: "Marcus Bell",
        taskTitle: "Ship it",
      }),
    ).toBe("Marcus deleted Ship it");
  });

  it("names a renamed task", () => {
    expect(
      formatNotificationBody({
        kind: "task_changed",
        actorName: "Marcus Bell",
        taskTitle: "Ship it",
        changeType: "renamed",
      }),
    ).toBe("Marcus renamed Ship it");
  });
});

describe("notificationActorLabel", () => {
  it("uses the first name", () => {
    expect(notificationActorLabel("Marcus Bell")).toBe("Marcus");
  });
});

describe("isTaskChangeTimelineType", () => {
  it("accepts rename and move, not commented", () => {
    expect(isTaskChangeTimelineType("renamed")).toBe(true);
    expect(isTaskChangeTimelineType("moved")).toBe(true);
    expect(isTaskChangeTimelineType("commented")).toBe(false);
  });
});
