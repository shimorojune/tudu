import { describe, expect, it } from "vitest";
import {
  formatAllDonePresentation,
  formatJiraUpdatedPresentation,
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

describe("formatJiraUpdatedPresentation", () => {
  const unchanged = {
    statusName: "Open",
    priorityName: "Major",
    dueAt: null,
    summary: "Fix bug",
    descriptionHash: "abc",
  };

  it("formats a status-only change", () => {
    const result = formatJiraUpdatedPresentation({
      title: "EGS-1: Fix bug",
      prior: unchanged,
      current: { ...unchanged, statusName: "Done" },
    });
    expect(result.title).toBe("EGS-1: Fix bug");
    expect(result.lines).toEqual(["Status: Open → Done"]);
    expect(result.summary).toBe("Status: Open → Done");
  });

  it("formats multiple fields in order", () => {
    const result = formatJiraUpdatedPresentation({
      title: "EGS-1: Fix bug",
      prior: unchanged,
      current: {
        ...unchanged,
        statusName: "In Progress",
        priorityName: "Critical",
      },
    });
    expect(result.lines).toEqual([
      "Status: Open → In Progress",
      "Priority: Major → Critical",
    ]);
    expect(result.summary).toContain("Status: Open → In Progress");
    expect(result.summary).toContain("Priority: Major → Critical");
  });

  it("describes description changes without a diff", () => {
    const result = formatJiraUpdatedPresentation({
      title: "EGS-1: Fix bug",
      prior: unchanged,
      current: { ...unchanged, descriptionHash: "def" },
    });
    expect(result.lines).toEqual(["Description updated"]);
  });

  it("formats due date from none to a date", () => {
    const dueAt = new Date("2026-09-15T12:00:00");
    const result = formatJiraUpdatedPresentation({
      title: "EGS-1: Fix bug",
      prior: unchanged,
      current: { ...unchanged, dueAt },
    });
    expect(result.lines).toEqual(["Due date: None → 2026-09-15"]);
  });
});
