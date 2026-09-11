import { describe, expect, it } from "vitest";
import { planTaskTimelineEvents, type TaskSnapshot } from "./timeline.js";

const base: TaskSnapshot = {
  title: "Ship feature",
  description: null,
  scheduledDate: "2026-09-06",
  bucket: "next",
  startDate: null,
  deadline: null,
  completedAt: null,
    inProgress: false,
  isPrivate: false,
  projectName: null,
};

describe("planTaskTimelineEvents", () => {
  it("returns nothing for a no-op patch", () => {
    expect(planTaskTimelineEvents({ before: base, after: base })).toEqual([]);
  });

  it("records a rename", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: { ...base, title: "Ship fix" },
    });
    expect(events).toEqual([
      { type: "renamed", data: { from: "Ship feature", to: "Ship fix" } },
    ]);
  });

  it("records a description change", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: { ...base, description: "More detail" },
    });
    expect(events).toEqual([{ type: "description_changed", data: {} }]);
  });

  it("records completion", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: { ...base, completedAt: "2026-09-06T10:00:00.000Z" },
    });
    expect(events).toEqual([{ type: "completed", data: {} }]);
  });

  it("records a bucket move within the same day", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: { ...base, bucket: "now" },
    });
    expect(events).toEqual([
      { type: "moved", data: { from: "next", to: "now" } },
    ]);
  });

  it("records a reschedule across days", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: {
        ...base,
        scheduledDate: "2026-09-07",
        bucket: "later",
      },
    });
    expect(events).toEqual([
      {
        type: "rescheduled",
        data: {
          fromDate: "2026-09-06",
          fromBucket: "next",
          toDate: "2026-09-07",
          toBucket: "later",
        },
      },
    ]);
  });

  it("emits separate events for rename and complete", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: {
        ...base,
        title: "Done thing",
        completedAt: "2026-09-06T10:00:00.000Z",
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("renamed");
    expect(events[1]?.type).toBe("completed");
  });

  it("records a project change", () => {
    const events = planTaskTimelineEvents({
      before: base,
      after: { ...base, projectName: "EGS" },
    });
    expect(events).toEqual([
      { type: "project_changed", data: { from: null, to: "EGS" } },
    ]);
  });
});
