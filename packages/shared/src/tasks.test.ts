import { describe, expect, it } from "vitest";
import { createTaskRequestSchema, laneSchema } from "./tasks.js";

describe("createTaskRequestSchema", () => {
  it("rejects a blank title", () => {
    const result = createTaskRequestSchema.safeParse({ title: "   " });

    expect(result.success).toBe(false);
  });

  it("defaults an otherwise bare task into the unscheduled backlog", () => {
    const result = createTaskRequestSchema.parse({ title: "Write the runbook" });

    expect(result.scheduledDate).toBeNull();
    expect(result.bucket).toBeNull();
  });

  it("rejects a day without a bucket", () => {
    const result = createTaskRequestSchema.safeParse({
      title: "Write the runbook",
      scheduledDate: "2026-09-05",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a bucket without a day", () => {
    const result = createTaskRequestSchema.safeParse({
      title: "Write the runbook",
      bucket: "now",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a day and a bucket together", () => {
    const result = createTaskRequestSchema.safeParse({
      title: "Write the runbook",
      scheduledDate: "2026-09-05",
      bucket: "now",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    const result = createTaskRequestSchema.safeParse({
      title: "Write the runbook",
      scheduledDate: "5 Sep 2026",
      bucket: "now",
    });

    expect(result.success).toBe(false);
  });
});

describe("laneSchema", () => {
  it("accepts the unscheduled lane", () => {
    const result = laneSchema.safeParse({
      scheduledDate: null,
      bucket: null,
      taskIds: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a lane with a bucket but no day", () => {
    const result = laneSchema.safeParse({
      scheduledDate: null,
      bucket: "later",
      taskIds: [],
    });

    expect(result.success).toBe(false);
  });
});
