import { describe, expect, it } from "vitest";
import { requestShortcutAction } from "./requestShortcuts";

describe("requestShortcutAction", () => {
  it("maps Cmd+1 and Cmd+2 to accept buckets", () => {
    const event = {
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      key: "1",
    } as KeyboardEvent;
    expect(requestShortcutAction(event)).toEqual({
      type: "accept",
      bucket: "next",
    });
  });

  it("maps Cmd+\\ to decline", () => {
    const event = {
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      key: "\\",
    } as KeyboardEvent;
    expect(requestShortcutAction(event)).toEqual({ type: "decline" });
  });
});
