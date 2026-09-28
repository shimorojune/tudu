import { beforeEach, describe, expect, it, vi } from "vitest";

const currentSyncSeq = vi.hoisted(() => vi.fn());
const listUnscheduledTasks = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    currentSyncSeq,
    listUnscheduledTasks,
  };
});

const { bootstrapViews } = await import("./applySyncOp.js");

describe("bootstrapViews", () => {
  beforeEach(() => {
    currentSyncSeq.mockResolvedValue(42);
    listUnscheduledTasks.mockReset();
    listUnscheduledTasks.mockResolvedValue([]);
  });

  it("maps legacy team keys to unscheduled bootstrap", async () => {
    const result = await bootstrapViews({} as never, "user-1", ["team:2026-09-27"]);

    expect(listUnscheduledTasks).toHaveBeenCalledWith({} as never, "user-1");
    expect(result).toEqual({ currentSeq: 42, events: [] });
  });
});
