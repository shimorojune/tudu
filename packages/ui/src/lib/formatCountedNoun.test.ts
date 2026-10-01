import { describe, expect, it } from "vitest";
import { formatCountedNoun } from "@/lib/formatCountedNoun";

describe("formatCountedNoun", () => {
  it("uses singular for count of 1", () => {
    expect(formatCountedNoun(1, "person")).toBe("1 person");
    expect(formatCountedNoun(1, "co-worker")).toBe("1 co-worker");
  });

  it("uses plural for other counts", () => {
    expect(formatCountedNoun(2, "person")).toBe("2 people");
    expect(formatCountedNoun(3, "co-worker")).toBe("3 co-workers");
  });
});
