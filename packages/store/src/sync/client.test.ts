import type { SyncOp } from "@tudu/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueue } from "./client.js";
import type { AppDispatch } from "../store.js";

const syncOp: SyncOp = {
  type: "jira.issue.updateFields",
  body: {
    issueIdOrKey: "EGS-123",
    summary: "Updated summary",
  },
};

describe("enqueue", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws the sync error body so UI handlers can show specific copy", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Jira project is not configured" }),
    }) as unknown as typeof fetch;
    const dispatch = vi.fn((action: unknown) => action) as unknown as AppDispatch;

    await expect(enqueue(syncOp)(dispatch)).rejects.toMatchObject({
      data: { error: "Jira project is not configured" },
    });
  });
});
