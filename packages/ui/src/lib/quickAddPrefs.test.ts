import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_QUICK_ADD_SHORTCUT,
  formatShortcutForDisplay,
  keyboardEventToAccelerator,
  readQuickAddShortcut,
  writeQuickAddShortcut,
  QUICK_ADD_SHORTCUT_STORAGE_KEY,
} from "./quickAddPrefs";

describe("quickAddPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default when storage is empty", () => {
    expect(readQuickAddShortcut()).toBe(DEFAULT_QUICK_ADD_SHORTCUT);
  });

  it("round-trips stored shortcut", () => {
    writeQuickAddShortcut("CommandOrControl+Shift+K");
    expect(localStorage.getItem(QUICK_ADD_SHORTCUT_STORAGE_KEY)).toBe(
      "CommandOrControl+Shift+K",
    );
    expect(readQuickAddShortcut()).toBe("CommandOrControl+Shift+K");
  });

  it("formats accelerators for display", () => {
    expect(formatShortcutForDisplay("CommandOrControl+Shift+N")).toBe(
      "Cmd + Shift + N",
    );
    expect(formatShortcutForDisplay("Alt+Space")).toBe("Option + Space");
  });

  it("maps option+space from keyboard events", () => {
    const event = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      altKey: true,
    });
    expect(keyboardEventToAccelerator(event)).toBe("Alt+Space");
  });

  it("builds accelerator from keyboard events", () => {
    const event = new KeyboardEvent("keydown", {
      key: "n",
      metaKey: true,
      shiftKey: true,
    });
    expect(keyboardEventToAccelerator(event)).toBe("CommandOrControl+Shift+N");
  });
});
