import { describe, expect, it } from "vitest";
import { reorderWithinSubset } from "./reorder.js";

describe("reorderWithinSubset", () => {
  it("permutes visible while hidden keep slots", () => {
    const full = ["a", "b", "c", "d"];
    const result = reorderWithinSubset(full, ["d", "b"]);
    expect(result).toEqual(["a", "d", "c", "b"]);
  });

  it("throws on unknown id", () => {
    expect(() => reorderWithinSubset(["a"], ["b"])).toThrow(/Unknown/);
  });

  it("throws on duplicate subset ids", () => {
    expect(() => reorderWithinSubset(["a", "b"], ["a", "a"])).toThrow(
      /Duplicate/,
    );
  });
});
