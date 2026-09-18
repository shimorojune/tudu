import { describe, expect, it } from "vitest";
import { parseQuickAddNaturalLanguage } from "./quickAddNaturalLanguage.js";

const ref = new Date("2026-09-18T10:00:00");
const today = "2026-09-18";

describe("parseQuickAddNaturalLanguage", () => {
  it("parses tomorrow and strips it from the title", () => {
    const result = parseQuickAddNaturalLanguage(
      "Go to dentist tomorrow at 6am",
      ref,
      today,
    );

    expect(result.scheduledDate).toBe("2026-09-19");
    expect(result.dayChoice).toBe("tomorrow");
    expect(result.titleForSave).toBe("Go to dentist");
    expect(result.spans.length).toBeGreaterThan(0);
    expect(result.chipLabel).toMatch(/Tomorrow/);
  });

  it("parses tmr shorthand", () => {
    const result = parseQuickAddNaturalLanguage(
      "Meet with x tmr",
      ref,
      today,
    );

    expect(result.scheduledDate).toBe("2026-09-19");
    expect(result.dayChoice).toBe("tomorrow");
    expect(result.titleForSave).toBe("Meet with x");
  });

  it("leaves text without dates unscheduled", () => {
    const result = parseQuickAddNaturalLanguage(
      "Write the runbook",
      ref,
      today,
    );

    expect(result.scheduledDate).toBeNull();
    expect(result.dayChoice).toBe("unscheduled");
    expect(result.titleForSave).toBe("Write the runbook");
    expect(result.chipLabel).toBeNull();
  });

  it("uses pick when the date is beyond tomorrow", () => {
    const result = parseQuickAddNaturalLanguage(
      "Ship fix next monday",
      ref,
      today,
    );

    expect(result.dayChoice).toBe("pick");
    expect(result.scheduledDate).toBe("2026-09-21");
    expect(result.titleForSave).toBe("Ship fix");
  });

  it("returns empty title for blank input", () => {
    const result = parseQuickAddNaturalLanguage("   ", ref, today);

    expect(result.titleForSave).toBe("");
    expect(result.scheduledDate).toBeNull();
  });
});
