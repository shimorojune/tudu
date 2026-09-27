import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@tudu/db";
import { createTasksRoute } from "./tasks.js";
import { createSessionTestApp } from "../test/harness.js";

const findTaskById = vi.hoisted(() => vi.fn());
const resolveTaskAccess = vi.hoisted(() => vi.fn());
const updateTask = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    findTaskById,
    resolveTaskAccess,
    updateTask,
    listTasksForDay: vi.fn().mockResolvedValue([]),
    listUnscheduledTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    reorderTasks: vi.fn(),
    rollOverTasks: vi.fn(),
    softDeleteTask: vi.fn(),
    createSubtask: vi.fn(),
    reorderSubtasks: vi.fn(),
    updateSubtask: vi.fn(),
    softDeleteSubtask: vi.fn(),
    deleteReportTask: vi.fn(),
    mapTask: vi.fn(),
  };
});

const actor = {
  id: "user-a",
  email: "a@test.com",
  name: "User A",
  createdAt: new Date("2026-01-01T12:00:00Z"),
};

const db = {} as Db;

describe("tasks route isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 on PATCH /tasks/:id without session", async () => {
    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createTasksRoute(db));
      },
      db,
      null,
    );

    const response = await app.request("http://localhost/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hijack" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 when resolveTaskAccess denies the task", async () => {
    resolveTaskAccess.mockResolvedValue(null);

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createTasksRoute(db));
      },
      db,
      actor,
    );

    const response = await app.request("http://localhost/tasks/other-users-task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });

    expect(response.status).toBe(404);
    expect(resolveTaskAccess).toHaveBeenCalledWith(
      db,
      actor.id,
      "other-users-task",
    );
  });
});
