import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@tudu/db";
import { createJoinRoute } from "./join.js";
import { createSessionTestApp } from "../test/harness.js";

const getJoinPreview = vi.hoisted(() => vi.fn());
const createJoinRequest = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    getJoinPreview,
    createJoinRequest,
  };
});

const db = {} as Db;
const user = {
  id: "user-1",
  email: "joiner@test.com",
  name: "Joiner",
  createdAt: new Date(),
};

describe("join routes", () => {
  beforeEach(() => {
    getJoinPreview.mockReset();
    createJoinRequest.mockReset();
  });

  it("returns join preview without a session", async () => {
    getJoinPreview.mockResolvedValue({
      orgName: "Acme",
      color: "cobalt",
      hasLogo: false,
      joinLinkEnabled: true,
    });

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createJoinRoute(db));
      },
      db,
      null,
    );

    const response = await app.request("/join/join-code");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.joinLinkEnabled).toBe(true);
  });

  it("requires auth to request join", async () => {
    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createJoinRoute(db));
      },
      db,
      null,
    );

    const response = await app.request("/join/join-code", { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("creates a join request for the signed-in user", async () => {
    createJoinRequest.mockResolvedValue(undefined);

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createJoinRoute(db));
      },
      db,
      user,
    );

    const response = await app.request("/join/join-code", { method: "POST" });
    expect(response.status).toBe(204);
    expect(createJoinRequest).toHaveBeenCalledWith(
      db,
      user.id,
      user.email,
      "join-code",
    );
  });
});
