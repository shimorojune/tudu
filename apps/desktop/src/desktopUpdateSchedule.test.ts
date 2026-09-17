import { describe, expect, it } from "vitest";
import {
  UPDATE_CHECK_FOCUS_DEBOUNCE_MS,
  shouldApplyUpdate,
  shouldNotifyForVersion,
  shouldRunFocusCheck,
  shouldRunUpdateCheck,
} from "./desktopUpdateSchedule.js";

describe("shouldRunUpdateCheck", () => {
  it("allows check when idle", () => {
    expect(shouldRunUpdateCheck("hidden", false)).toBe(true);
    expect(shouldRunUpdateCheck("available", false)).toBe(true);
  });

  it("blocks while in flight or installing", () => {
    expect(shouldRunUpdateCheck("hidden", true)).toBe(false);
    expect(shouldRunUpdateCheck("downloading", false)).toBe(false);
    expect(shouldRunUpdateCheck("ready", false)).toBe(false);
  });
});

describe("shouldApplyUpdate", () => {
  it("applies when not dismissed", () => {
    expect(shouldApplyUpdate("0.27.0", undefined)).toBe(true);
  });

  it("skips dismissed version", () => {
    expect(shouldApplyUpdate("0.27.0", "0.27.0")).toBe(false);
    expect(shouldApplyUpdate("0.28.0", "0.27.0")).toBe(true);
  });
});

describe("shouldNotifyForVersion", () => {
  it("notifies once per version", () => {
    expect(shouldNotifyForVersion("0.27.0", undefined, undefined)).toBe(true);
    expect(shouldNotifyForVersion("0.27.0", undefined, "0.27.0")).toBe(false);
  });

  it("does not notify for dismissed version", () => {
    expect(shouldNotifyForVersion("0.27.0", "0.27.0", undefined)).toBe(false);
  });
});

describe("shouldRunFocusCheck", () => {
  it("debounces focus checks", () => {
    const now = 100_000;
    expect(shouldRunFocusCheck(undefined, now)).toBe(true);
    expect(shouldRunFocusCheck(now - UPDATE_CHECK_FOCUS_DEBOUNCE_MS, now)).toBe(
      true,
    );
    expect(
      shouldRunFocusCheck(now - UPDATE_CHECK_FOCUS_DEBOUNCE_MS + 1, now),
    ).toBe(false);
  });
});
