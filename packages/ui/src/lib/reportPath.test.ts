import { describe, expect, it } from "vitest";
import { isWeekPath, reportUserIdFromPath } from "./reportPath";

describe("reportUserIdFromPath", () => {
  it("reads the person from a report day and week path", () => {
    expect(reportUserIdFromPath("/team/priya")).toBe("priya");
    expect(reportUserIdFromPath("/team/priya/week")).toBe("priya");
    expect(reportUserIdFromPath("/team/priya/inbox")).toBe("priya");
    expect(reportUserIdFromPath("/team")).toBeNull();
    expect(reportUserIdFromPath("/week")).toBeNull();
    expect(reportUserIdFromPath("/inbox")).toBeNull();
  });
});

describe("isWeekPath", () => {
  it("treats personal and report week as week views", () => {
    expect(isWeekPath("/week")).toBe(true);
    expect(isWeekPath("/team/priya/week")).toBe(true);
    expect(isWeekPath("/team/priya")).toBe(false);
    expect(isWeekPath("/team/priya/inbox")).toBe(false);
    expect(isWeekPath("/")).toBe(false);
  });
});
