import { describe, expect, it } from "vitest";
import { viewportBandFromWidth } from "./viewport";

describe("viewportBandFromWidth", () => {
  it("treats widths under 768 as phone", () => {
    expect(viewportBandFromWidth(390)).toBe("phone");
    expect(viewportBandFromWidth(767)).toBe("phone");
  });

  it("treats 768 through 1279 as tablet", () => {
    expect(viewportBandFromWidth(768)).toBe("tablet");
    expect(viewportBandFromWidth(1024)).toBe("tablet");
    expect(viewportBandFromWidth(1279)).toBe("tablet");
  });

  it("treats 1280 and up as desktop", () => {
    expect(viewportBandFromWidth(1280)).toBe("desktop");
    expect(viewportBandFromWidth(1440)).toBe("desktop");
  });
});
