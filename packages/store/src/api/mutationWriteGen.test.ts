import { describe, expect, it } from "vitest";
import {
  isLatestWriteGeneration,
  nextWriteGeneration,
  resetWriteGenerations,
} from "./mutationWriteGen.js";

describe("mutationWriteGen", () => {
  it("tracks the latest generation per entity", () => {
    resetWriteGenerations();
    const first = nextWriteGeneration("task-1");
    const second = nextWriteGeneration("task-1");

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(isLatestWriteGeneration("task-1", 2)).toBe(true);
    expect(isLatestWriteGeneration("task-1", 1)).toBe(false);
  });
});
