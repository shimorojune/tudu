import { afterEach, describe, expect, it, vi } from "vitest";
import { createTuduApi, TuduApiClientError } from "./api.js";

describe("createTuduApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards bearer token on sync", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        clientMutationId: "m1",
        seq: 1,
        events: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const api = createTuduApi("token-123");
    await api.sync({
      type: "task.delete",
      id: "00000000-0000-4000-8000-000000000001",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/sync"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
      }),
    );
  });

  it("throws TuduApiClientError on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Insufficient scope" }),
      }),
    );

    const api = createTuduApi("token-123");
    await expect(
      api.get("/orgs"),
    ).rejects.toBeInstanceOf(TuduApiClientError);
  });
});
