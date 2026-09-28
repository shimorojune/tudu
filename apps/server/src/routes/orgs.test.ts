import { describe, expect, it } from "vitest";
import type { Db } from "@tudu/db";
import { createOrgsRoute } from "./orgs.js";
import { createSessionTestApp } from "../test/harness.js";

const db = {} as Db;

describe("orgs routes auth", () => {
  it("returns 401 for GET /orgs without session", async () => {
    const app = createSessionTestApp(
      (instance) => {
        instance.route("/orgs", createOrgsRoute(db));
      },
      db,
      null,
    );
    const response = await app.request("/orgs");
    expect(response.status).toBe(401);
  });
});
