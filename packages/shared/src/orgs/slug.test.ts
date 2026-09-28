import { describe, expect, it } from "vitest";
import { slugify, withCollisionSuffix } from "./slug.js";

describe("slugify", () => {
  it("normalizes punctuation", () => {
    expect(slugify("EGSoft")).toBe("egsoft");
    expect(slugify("  Hello   World  ")).toBe("hello-world");
  });

  it("falls back when only symbols", () => {
    expect(slugify("!!!")).toBe("org");
  });

  it("truncates long names without trailing hyphen", () => {
    const long = "a".repeat(50);
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("withCollisionSuffix", () => {
  it("adds numeric suffix", () => {
    const taken = new Set(["egsoft"]);
    expect(withCollisionSuffix("egsoft", taken)).toBe("egsoft-2");
  });
});
