import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgActionError, type Db } from "@tudu/db";
import { createOrgsRoute } from "./orgs.js";
import { createSessionTestApp } from "../test/harness.js";

const getOrgDetail = vi.hoisted(() => vi.fn());
const listSpacesForUser = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    getOrgDetail,
    listSpacesForUser,
  };
});

const db = {} as Db;
const userA = {
  id: "user-a",
  email: "a@test.com",
  name: "A",
  createdAt: new Date(),
};
const userB = {
  id: "user-b",
  email: "b@test.com",
  name: "B",
  createdAt: new Date(),
};

describe("orgs route isolation", () => {
  beforeEach(() => {
    getOrgDetail.mockReset();
    listSpacesForUser.mockReset();
  });

  it("returns 404 when another user's org is requested", async () => {
    getOrgDetail.mockRejectedValue(
      new OrgActionError("ORG_NOT_FOUND", "Organization not found", 404),
    );

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/orgs", createOrgsRoute(db));
      },
      db,
      userB,
    );

    const response = await app.request("/orgs/private-org");
    expect(response.status).toBe(404);
    expect(getOrgDetail).toHaveBeenCalledWith(db, userB.id, "private-org");
  });

  it("lists only spaces visible to the signed-in user", async () => {
    listSpacesForUser.mockResolvedValue([
      { kind: "personal", name: "Personal" },
    ]);

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/orgs", createOrgsRoute(db));
      },
      db,
      userA,
    );

    const response = await app.request("/orgs");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.spaces).toHaveLength(1);
    expect(listSpacesForUser).toHaveBeenCalledWith(db, userA.id);
  });
});
