import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeStore } from "../store.js";
import { healthApi } from "./healthApi.js";

const server = setupServer(
  http.get("http://localhost:3456/health", () =>
    HttpResponse.json({ status: "ok", version: "0.0.0-test" }),
  ),
);

describe("healthApi via MSW", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => server.resetHandlers());

  afterAll(() => server.close());

  it("fetches health through RTK Query", async () => {
    const store = makeStore();
    const result = await store.dispatch(
      healthApi.endpoints.getHealth.initiate(undefined, { forceRefetch: true }),
    );

    expect(result.data?.status).toBe("ok");
    expect(result.data?.version).toBe("0.0.0-test");
  });
});
