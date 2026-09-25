import { describe, expect, it } from "vitest";
import { logicalDayJumpOptions, offsetLogicalDay } from "./logicalDayOptions";

describe("logicalDayJumpOptions", () => {
  it("offsets from the effective today anchor", () => {
    expect(offsetLogicalDay("2026-09-25", -1)).toBe("2026-09-24");
    expect(offsetLogicalDay("2026-09-25", 1)).toBe("2026-09-26");

    const options = logicalDayJumpOptions("2026-09-25");
    expect(options.map((option) => option.value)).toEqual([
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
  });
});
