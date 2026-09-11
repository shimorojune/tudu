import { describe, expect, it } from "vitest";
import { formatNotificationBody } from "@tudu/shared";
import { uniqueIds } from "./sync.js";

describe("notification recipients", () => {
  it("drops the actor so writers are not notified", () => {
    expect(uniqueIds(["priya", "marcus"]).filter((id) => id !== "marcus")).toEqual([
      "priya",
    ]);
  });
});

describe("notification insert skips empty copy", () => {
  it("has no body when the title is blank", () => {
    expect(
      formatNotificationBody({
        kind: "inbox",
        actorName: "Marcus",
        taskTitle: "",
      }),
    ).toBeNull();
  });
});
