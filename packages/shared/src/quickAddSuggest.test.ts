import { describe, expect, it } from "vitest";
import {
  quickAddSuggestRequestSchema,
  QUICK_ADD_BUCKET_CONFIDENCE_MIN,
  QUICK_ADD_PROJECT_CONFIDENCE_MIN,
} from "./quickAddSuggest.js";

describe("quickAddSuggest schemas", () => {
  it("accepts a minimal valid suggest request", () => {
    const parsed = quickAddSuggestRequestSchema.parse({
      titleForSave: "Ship tests",
      today: "2026-09-27",
      nowCount: 2,
      scheduledDate: null,
    });
    expect(parsed.titleForSave).toBe("Ship tests");
    expect(parsed.parsedStartDate).toBeNull();
  });

  it("rejects invalid calendar dates", () => {
    expect(() =>
      quickAddSuggestRequestSchema.parse({
        titleForSave: "x",
        today: "09-27-2026",
        nowCount: 0,
        scheduledDate: null,
      }),
    ).toThrow();
  });

  it("exposes confidence thresholds in sensible order", () => {
    expect(QUICK_ADD_PROJECT_CONFIDENCE_MIN).toBeGreaterThan(
      QUICK_ADD_BUCKET_CONFIDENCE_MIN,
    );
  });
});
