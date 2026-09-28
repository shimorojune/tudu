import { describe, expect, it } from "vitest";
import { rightsAudienceLabel, rightsReferenceRows } from "./rightsReference.js";

describe("rightsReferenceRows", () => {
  it("matches design 5.10 audiences for EGSoft", () => {
    const rows = rightsReferenceRows("EGSoft");
    const byLabel = new Map(
      rows.map((row) => [row.label, rightsAudienceLabel(row.audience)]),
    );

    expect(byLabel.get("Read a co-worker's day, week and timelines")).toBe(
      "Anyone",
    );
    expect(byLabel.get("Comment on a co-worker's task")).toBe("Anyone");
    expect(byLabel.get("Send a co-worker a new task")).toBe("Anyone");
    expect(byLabel.get("Invite someone to the organization")).toBe("Anyone");
    expect(byLabel.get("Reorder my buckets")).toBe("Manager");
    expect(byLabel.get("Retitle my task, or edit its detail")).toBe("Manager");
    expect(byLabel.get("Set or change a deadline on my task")).toBe("Manager");
    expect(byLabel.get("Complete or reopen my task")).toBe("Manager");
    expect(byLabel.get("Link a JIRA issue to my task")).toBe("Manager");
    expect(byLabel.get("Put anything into my day without asking")).toBe(
      "Nobody",
    );
    expect(byLabel.get("See a task I marked private")).toBe("Nobody");
    expect(byLabel.get("Move my task out of EGSoft")).toBe("Nobody");
    expect(byLabel.get("Assign who manages me")).toBe("Nobody");
    expect(rows).toHaveLength(13);
  });
});
