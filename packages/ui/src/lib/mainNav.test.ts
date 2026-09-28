import { describe, expect, it } from "vitest";
import { mainNavItems } from "./mainNav";

describe("mainNavItems", () => {
  it("includes requests for personal space", () => {
    const items = mainNavItems(null);
    expect(items.map((item) => item.label)).toEqual([
      "Today",
      "Week",
      "Requests",
      "Unscheduled",
    ]);
  });

  it("adds co-workers tab in org space", () => {
    const items = mainNavItems("acme");
    expect(items.at(-1)?.label).toBe("Co-workers");
    expect(items.at(-1)?.to).toBe("/o/acme/coworkers");
  });
});
