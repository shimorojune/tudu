import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncOp } from "@tudu/shared";

const claimMutation = vi.hoisted(() => vi.fn());
const sendNewTaskRequest = vi.hoisted(() => vi.fn());
const emitSync = vi.hoisted(() => vi.fn());
const mapTaskRequest = vi.hoisted(() => vi.fn());
const loadTaskWithSubtasks = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    claimMutation,
    sendNewTaskRequest,
    emitSync,
    mapTaskRequest,
    loadTaskWithSubtasks,
    recipientsForRequest: (from: string, to: string) => [from, to],
  };
});

const { applySyncOp } = await import("./applySyncOp.js");

describe("applySyncOp request ops", () => {
  beforeEach(() => {
    claimMutation.mockResolvedValue("claimed");
    sendNewTaskRequest.mockResolvedValue({
      request: { id: "req-1", fromUserId: "a", toUserId: "b", taskId: "t-1" },
      task: { id: "t-1" },
    });
    mapTaskRequest.mockResolvedValue({ id: "req-1" });
    loadTaskWithSubtasks.mockResolvedValue({ id: "t-1" });
    emitSync.mockResolvedValue([]);
  });

  it("rejects spoofed accept when actor is not the recipient", async () => {
    const withdrawTaskRequest = vi.fn();
    vi.doMock("@tudu/db", () => ({
      withdrawTaskRequest,
    }));
    const op: SyncOp = {
      type: "request.withdraw",
      body: { requestId: "req-1" },
    };
    await expect(
      applySyncOp({} as never, "not-sender", "client-1", op),
    ).rejects.toThrow();
  });
});
