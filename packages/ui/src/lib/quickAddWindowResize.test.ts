import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyQuickAddPopoverOpen,
  QUICK_ADD_COMPACT_HEIGHT,
  QUICK_ADD_EXPANDED_HEIGHT_DATE,
  QUICK_ADD_EXPANDED_HEIGHT_DEADLINE,
  QUICK_ADD_WINDOW_WIDTH,
  resetQuickAddWindowHeight,
} from "./quickAddWindowResize";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("quickAddWindowResize", () => {
  beforeEach(async () => {
    vi.mocked(invoke).mockClear();
    await resetQuickAddWindowHeight();
  });

  it("expands while a popover is open and compacts when the last closes", async () => {
    await notifyQuickAddPopoverOpen(true, { variant: "date" });
    expect(invoke).toHaveBeenLastCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_EXPANDED_HEIGHT_DATE,
    });

    await notifyQuickAddPopoverOpen(true, { variant: "date" });
    expect(invoke).toHaveBeenLastCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_EXPANDED_HEIGHT_DATE,
    });

    await notifyQuickAddPopoverOpen(false, { variant: "date" });
    expect(invoke).toHaveBeenLastCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_EXPANDED_HEIGHT_DATE,
    });

    await notifyQuickAddPopoverOpen(false, { variant: "date" });
    expect(invoke).toHaveBeenLastCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_COMPACT_HEIGHT,
    });
  });

  it("uses the taller height when a deadline popover is open", async () => {
    await notifyQuickAddPopoverOpen(true, { variant: "deadline" });
    expect(invoke).toHaveBeenLastCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_EXPANDED_HEIGHT_DEADLINE,
    });
  });

  it("reset forces compact height", async () => {
    await notifyQuickAddPopoverOpen(true, { variant: "date" });
    await resetQuickAddWindowHeight();
    expect(invoke).toHaveBeenLastCalledWith("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height: QUICK_ADD_COMPACT_HEIGHT,
    });
  });
});
