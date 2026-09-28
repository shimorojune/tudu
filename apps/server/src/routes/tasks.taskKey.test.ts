import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createTasksRoute } from "./tasks.js";

const findTaskByKey = vi.hoisted(() => vi.fn());
const loadTaskWithSubtasks = vi.hoisted(() => vi.fn());
const resolveTaskAccess = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    findTaskByKey,
    loadTaskWithSubtasks,
    resolveTaskAccess,
  };
});

describe("GET /tasks/by-key/:key", () => {
  beforeEach(() => {
    findTaskByKey.mockReset();
    loadTaskWithSubtasks.mockReset();
    resolveTaskAccess.mockReset();
  });

  it("returns 404 when the key does not resolve", async () => {
    findTaskByKey.mockResolvedValue(null);
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("session", { user: { id: "user-1" } } as never);
      await next();
    });
    app.route("/", createTasksRoute({} as never));

    const response = await app.request("/tasks/by-key/ME-99");
    expect(response.status).toBe(404);
  });
});
