import { describe, expect, it } from "vitest";
import {
  formatAllDonePresentation,
  formatRegularPresentation,
  presentationOsBody,
} from "./notificationPresentation.js";

describe("formatRegularPresentation", () => {
  it("formats total and bucket breakdown", () => {
    const result = formatRegularPresentation({ now: 2, next: 3, later: 2 });
    expect(result.title).toBe("7 tasks left today");
    expect(result.lines[0]).toBe("2 Now, 3 Next, 2 Later");
  });

  it("uses singular title for one task", () => {
    const result = formatRegularPresentation({ now: 1, next: 0, later: 0 });
    expect(result.title).toBe("1 task left today");
    expect(result.lines[0]).toBe("1 Now");
  });
});

describe("formatAllDonePresentation", () => {
  it("announces completion", () => {
    expect(formatAllDonePresentation().title).toBe("All done for today");
  });
});

describe("presentationOsBody", () => {
  it("prefers summary then lines", () => {
    const body = presentationOsBody({
      title: "Title",
      summary: "Summary",
      lines: ["Line"],
    });
    expect(body).toBe("Summary");
  });
});
