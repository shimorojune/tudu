import { describe, expect, it } from "vitest";
import type { Task } from "@tudu/shared";
import {
  formatInMyDayPlacement,
  issueTetheredOnDay,
  linkedTasksInSelectedDay,
} from "./jiraInMyDay.js";

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Task",
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
    project: null,
    jiraLinks: [],
    subtasks: [],
    taskNumber: 1,
    taskKey: "EGSF-1",
    ...overrides,
  };
}

describe("jiraInMyDay", () => {
  it("detects tether when a linked task is on the selected day", () => {
    const task = baseTask();
    const tasksById = new Map([[task.id, task]]);
    const issue = {
      id: "1",
      key: "EGS-1",
      summary: "Issue",
      description: null,
      renderedDescription: null,
      status: { id: "1", name: "New", category: "todo" as const, colorName: null },
      issueType: "Task",
      priority: null,
      assignee: null,
      dueDate: null,
      components: [],
      updatedAt: "2026-09-11T09:00:00.000Z",
      browseUrl: "https://jira.example.test/browse/EGS-1",
      linkedTasks: [
        { taskId: task.id, title: task.title, isPrivate: false },
      ],
      editableFields: [],
    };

    expect(issueTetheredOnDay(issue, "2026-09-11", tasksById)).toBe(true);
    expect(issueTetheredOnDay(issue, "2026-09-12", tasksById)).toBe(false);
    expect(linkedTasksInSelectedDay(issue, "2026-09-11", tasksById)).toHaveLength(1);
  });

  it("formats in my day with bucket and subtask progress", () => {
    const task = baseTask({
      bucket: "now",
      subtasks: [
        {
          id: "a",
          taskId: "11111111-1111-4111-8111-111111111111",
          title: "One",
          done: true,
          position: 0,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "b",
          taskId: "11111111-1111-4111-8111-111111111111",
          title: "Two",
          done: false,
          position: 1,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "c",
          taskId: "11111111-1111-4111-8111-111111111111",
          title: "Three",
          done: true,
          position: 2,
          createdAt: "",
          updatedAt: "",
        },
      ],
    });

    expect(formatInMyDayPlacement(task, "2026-09-11", "2026-09-11")).toBe(
      "in my day · Now, 2 of 3 done",
    );
  });
});
