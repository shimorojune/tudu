import { describe, expect, it } from "vitest";
import {
  createTaskRequestSchema,
  laneSchema,
  taskSchema,
  updateTaskRequestSchema,
} from "./tasks.js";

describe("createTaskRequestSchema", () => {
  it("rejects a blank title", () => {
    const result = createTaskRequestSchema.safeParse({ title: "   " });

    expect(result.success).toBe(false);
  });

  it("defaults an otherwise bare task into the unscheduled backlog", () => {
    const result = createTaskRequestSchema.parse({ title: "Write the runbook" });

    expect(result.scheduledDate).toBeNull();
    expect(result.bucket).toBeNull();
    expect(result.description).toBeNull();
    expect(result.projectId).toBeUndefined();
  });

  it("accepts a project id", () => {
    const result = createTaskRequestSchema.parse({
      title: "Write the runbook",
      projectId: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.projectId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("accepts a description and trims blank to null", () => {
    const withDescription = createTaskRequestSchema.parse({
      title: "Write the runbook",
      description: "  More detail  ",
      scheduledDate: "2026-09-05",
      bucket: "now",
    });

    expect(withDescription.description).toBe("More detail");

    const blankDescription = createTaskRequestSchema.parse({
      title: "Write the runbook",
      description: "   ",
      scheduledDate: "2026-09-05",
      bucket: "now",
    });

    expect(blankDescription.description).toBeNull();
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

describe("updateTaskRequestSchema", () => {
  it("does not invent a description on a title-only patch", () => {
    const result = updateTaskRequestSchema.parse({ title: "Ship it" });

    expect(result).toEqual({ title: "Ship it" });
    expect("description" in result).toBe(false);
  });

  it("clears a blank description and keeps a trimmed one", () => {
    expect(updateTaskRequestSchema.parse({ description: "  " })).toEqual({
      description: null,
    });
    expect(updateTaskRequestSchema.parse({ description: " More " })).toEqual({
      description: "More",
    });
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

describe("taskSchema", () => {
  it("requires Jira link summaries as task metadata", () => {
    const task = taskSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Write the regression",
      description: null,
      scheduledDate: null,
      bucket: null,
      position: 0,
      startDate: null,
      deadline: null,
      completedAt: null,
      inProgress: false,
      carriedDays: 0,
      carriedSince: null,
      isPrivate: false,
      createdAt: "2026-09-13T10:00:00.000Z",
      updatedAt: "2026-09-13T10:00:00.000Z",
      subtasks: [],
      commentCount: 0,
      project: null,
      jiraLinks: [
        {
          issueId: "100493",
          key: "EGS-100493",
          summary: "Improve archive permission error",
          statusName: "In Progress",
          dueDate: "2026-09-15",
          browseUrl: "https://beetle.egain.com/browse/EGS-100493",
        },
      ],
      taskNumber: 100493,
      taskKey: "ME-100493",
    });

    expect(task.jiraLinks[0]?.summary).toBe("Improve archive permission error");
  });
});
