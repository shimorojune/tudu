import { describe, expect, it } from "vitest";
import { shortcutLabel, spaceForShortcut } from "./spaceShortcuts.js";

describe("spaceForShortcut", () => {
  const spaces = [
    { kind: "personal" as const },
    { kind: "org" as const, orgId: "o1", slug: "acme" },
  ];

  it("returns null for out of range indices", () => {
    expect(spaceForShortcut(-1, spaces)).toBeNull();
    expect(spaceForShortcut(9, spaces)).toBeNull();
  });

  it("maps 0-based index to space list position", () => {
    expect(spaceForShortcut(0, spaces)?.kind).toBe("personal");
    expect(spaceForShortcut(1, spaces)?.slug).toBe("acme");
    expect(spaceForShortcut(2, spaces)).toBeNull();
  });
});

describe("shortcutLabel", () => {
  it("uses Ctrl on mac and Alt elsewhere", () => {
    expect(shortcutLabel(0, "mac")).toBe("Ctrl+1");
    expect(shortcutLabel(2, "other")).toBe("Alt+3");
  });
});
