import { describe, expect, it } from "vitest";
import {
  LEGACY_PROJECT_COLOR_MAP,
  mapLegacyProjectColor,
  nextFreeColor,
} from "./colors.js";

describe("colors", () => {
  it("maps legacy project colors", () => {
    expect(mapLegacyProjectColor("ember")).toBe("vermilion");
    expect(mapLegacyProjectColor("rust")).toBe("rose");
    expect(LEGACY_PROJECT_COLOR_MAP.clay).toBe("amber");
  });

  it("picks next free color", () => {
    expect(nextFreeColor([])).toBe("vermilion");
    expect(nextFreeColor(["vermilion", "amber"])).toBe("ochre");
  });
});
