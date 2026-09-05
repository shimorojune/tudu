import { describe, expect, it } from "vitest";
import { bucketLabel } from "./buckets";

describe("bucketLabel", () => {
  it("uses Now / Next / Later for today", () => {
    expect(bucketLabel("now", true)).toBe("Now");
    expect(bucketLabel("next", true)).toBe("Next");
    expect(bucketLabel("later", true)).toBe("Later");
  });

  it("uses Priority labels for other days", () => {
    expect(bucketLabel("now", false)).toBe("Priority 1");
    expect(bucketLabel("next", false)).toBe("Priority 2");
    expect(bucketLabel("later", false)).toBe("Priority 3");
  });
});
