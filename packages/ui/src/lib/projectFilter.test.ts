import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import {
  isTaskDimmed,
  mergeReportFilterProjects,
  parseProjectSearch,
} from "./projectFilter.js";

const projectId = "11111111-1111-4111-8111-111111111111";

function task(project: Task["project"]): Task {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Ship it",
    description: null,
    scheduledDate: "2026-09-11",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-11T08:00:00.000Z",
    updatedAt: "2026-09-11T08:00:00.000Z",
    commentCount: 0,
    project,
    subtasks: [],
  };
}

describe("parseProjectSearch", () => {
  it("keeps a uuid and drops junk", () => {
    expect(parseProjectSearch({ project: projectId })).toEqual({
      project: projectId,
    });
    expect(parseProjectSearch({ project: "EGS" })).toEqual({});
  });
});

describe("isTaskDimmed", () => {
  it("dims unmatched tasks and leaves a clear filter honest", () => {
    const matched = task({
      id: projectId,
      name: "EGS",
      color: "vermilion",
      archivedAt: null,
      isPrivate: false,
    });
    const other = task(null);

    expect(isTaskDimmed(matched, projectId)).toBe(false);
    expect(isTaskDimmed(other, projectId)).toBe(true);
    expect(isTaskDimmed(other, undefined)).toBe(false);
  });
});

describe("mergeReportFilterProjects", () => {
  it("keeps empty public projects and chips, and drops private", () => {
    const emptyPublic = {
      id: "33333333-3333-4333-8333-333333333333",
      userId: "report",
      name: "Kitchen",
      color: "moss" as const,
      archivedAt: null,
      isPrivate: false,
      createdAt: "2026-09-11T08:00:00.000Z",
      updatedAt: "2026-09-11T08:00:00.000Z",
    };
    const hidden = {
      ...emptyPublic,
      id: "44444444-4444-4444-8444-444444444444",
      name: "Side",
      isPrivate: true,
    };
    const chipTask = task({
      id: projectId,
      name: "EGS",
      color: "vermilion",
      archivedAt: null,
      isPrivate: false,
    });

    const merged = mergeReportFilterProjects(
      [emptyPublic, hidden],
      [chipTask],
    );

    expect(merged.map((project) => project.name).sort()).toEqual([
      "EGS",
      "Kitchen",
    ]);
  });
});
