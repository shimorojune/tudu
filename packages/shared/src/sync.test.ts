import { describe, expect, it } from "vitest";
import { parseViewKey, recipientsForTask, viewKey } from "./sync.js";

describe("recipientsForTask", () => {
  it("always includes the owner", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: false,
        managerUserId: null,
      }),
    ).toEqual(["priya"]);
  });

  it("adds the manager when the task is not private", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: false,
        managerUserId: "marcus",
      }),
    ).toEqual(["priya", "marcus"]);
  });

  it("hides the manager when the task is private", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: true,
        managerUserId: "marcus",
      }),
    ).toEqual(["priya"]);
  });
});

describe("viewKey", () => {
  it("round-trips day, inbox, and report day", () => {
    expect(parseViewKey(viewKey.day("2026-09-10"))).toEqual({
      type: "day",
      date: "2026-09-10",
    });
    expect(parseViewKey(viewKey.inbox())).toEqual({ type: "inbox" });
    expect(parseViewKey(viewKey.notifications())).toEqual({
      type: "notifications",
    });
    expect(parseViewKey(viewKey.reportDay("u1", "2026-09-10"))).toEqual({
      type: "reportDay",
      userId: "u1",
      date: "2026-09-10",
    });
  });
});
