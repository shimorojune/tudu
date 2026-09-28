import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { makeStore } from "../store.js";
import { orgsApi } from "./orgsApi.js";
import type { OrgErrorPayload } from "./orgsApi.js";

const server = setupServer(
  http.get("http://localhost:3456/orgs", () =>
    HttpResponse.json({
      spaces: [{ kind: "personal", name: "Personal", taskCount: 2 }],
    }),
  ),
);

describe("orgsApi via MSW", () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => server.resetHandlers());

  afterAll(() => server.close());

  it("loads spaces", async () => {
    const store = makeStore();
    const result = await store.dispatch(
      orgsApi.endpoints.listSpaces.initiate(undefined, { forceRefetch: true }),
    );
    expect(result.data?.spaces[0]?.kind).toBe("personal");
  });

  it("surfaces validation errors from createOrg", async () => {
    server.use(
      http.post("http://localhost:3456/orgs", () =>
        HttpResponse.json(
          { error: "Invalid organization name", code: "VALIDATION" },
          { status: 422 },
        ),
      ),
    );
    const store = makeStore();
    const result = await store.dispatch(
      orgsApi.endpoints.createOrg.initiate({
        name: "",
      }),
    );
    expect(result.error).toBeDefined();
    const payload = result.error as { status: number; data: OrgErrorPayload };
    expect(payload.status).toBe(422);
    expect(payload.data.code).toBe("VALIDATION");
  });
});
