import { describe, expect, it, beforeEach } from "vitest";
import {
  dismissMidnight,
  dismissRecap,
  isMidnightDismissed,
  isRecapDismissed,
  readDayOverride,
  readLastRun,
  writeDayOverride,
  writeLastRun,
} from "./rolloverState.js";

describe("rolloverState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("tracks last run effective day", () => {
    expect(readLastRun()).toBeNull();
    writeLastRun("2026-09-06");
    expect(readLastRun()).toBe("2026-09-06");
  });

  it("dismisses recap per effective day", () => {
    expect(isRecapDismissed("2026-09-06")).toBe(false);
    dismissRecap("2026-09-06");
    expect(isRecapDismissed("2026-09-06")).toBe(true);
    expect(isRecapDismissed("2026-09-07")).toBe(false);
  });

  it("dismisses midnight per calendar day", () => {
    expect(isMidnightDismissed("2026-09-07")).toBe(false);
    dismissMidnight("2026-09-07");
    expect(isMidnightDismissed("2026-09-07")).toBe(true);
  });

  it("stores day override", () => {
    expect(readDayOverride()).toBeNull();
    writeDayOverride("2026-09-05");
    expect(readDayOverride()).toBe("2026-09-05");
    writeDayOverride(null);
    expect(readDayOverride()).toBeNull();
  });
});
