import { describe, expect, it } from "vitest";
import { inboxShortcutAction } from "./inboxShortcuts";

describe("inboxShortcutAction", () => {
  it("maps Cmd+1/2/3 to buckets and Cmd+\\ to decline", () => {
    expect(
      inboxShortcutAction(
        new KeyboardEvent("keydown", { key: "1", metaKey: true }),
      ),
    ).toBe("now");
    expect(
      inboxShortcutAction(
        new KeyboardEvent("keydown", { key: "2", metaKey: true }),
      ),
    ).toBe("next");
    expect(
      inboxShortcutAction(
        new KeyboardEvent("keydown", { key: "3", ctrlKey: true }),
      ),
    ).toBe("later");
    expect(
      inboxShortcutAction(
        new KeyboardEvent("keydown", { key: "\\", metaKey: true }),
      ),
    ).toBe("decline");
  });

  it("ignores unmodified keys", () => {
    expect(
      inboxShortcutAction(new KeyboardEvent("keydown", { key: "1" })),
    ).toBeNull();
  });
});
