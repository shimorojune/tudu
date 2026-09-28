import { describe, expect, it } from "vitest";
import {
  isPersonalSpacePath,
  isSpaceNeutralPath,
  parseOrgSlugFromPath,
} from "./spaceNav";

describe("spaceNav", () => {
  it("parses org slug from path", () => {
    expect(parseOrgSlugFromPath("/o/acme/week")).toBe("acme");
  });

  it("marks personal routes", () => {
    expect(isPersonalSpacePath("/")).toBe(true);
    expect(isPersonalSpacePath("/week")).toBe(true);
    expect(isPersonalSpacePath("/settings")).toBe(false);
  });

  it("marks neutral routes", () => {
    expect(isSpaceNeutralPath("/settings")).toBe(true);
    expect(isSpaceNeutralPath("/projects/abc")).toBe(true);
    expect(isSpaceNeutralPath("/o/acme")).toBe(false);
  });
});
