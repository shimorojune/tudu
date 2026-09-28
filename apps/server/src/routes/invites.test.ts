import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@tudu/db";
import { createInvitesRoute } from "./invites.js";
import { createSessionTestApp } from "../test/harness.js";

const getInvitePreview = vi.hoisted(() => vi.fn());
const acceptOrgInvite = vi.hoisted(() => vi.fn());
const listMyPendingInvites = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    getInvitePreview,
    acceptOrgInvite,
    listMyPendingInvites,
  };
});

const db = {} as Db;
const user = {
  id: "user-1",
  email: "invitee@test.com",
  name: "Invitee",
  createdAt: new Date(),
};

describe("invites routes", () => {
  beforeEach(() => {
    getInvitePreview.mockReset();
    acceptOrgInvite.mockReset();
    listMyPendingInvites.mockReset();
  });

  it("returns invite preview without a session", async () => {
    getInvitePreview.mockResolvedValue({
      orgName: "Acme",
      color: "cobalt",
      hasLogo: false,
      inviterName: "Ana",
      invitedEmail: "invitee@test.com",
      status: "pending",
    });

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createInvitesRoute(db));
      },
      db,
      null,
    );

    const response = await app.request("/invites/token-abc");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orgName).toBe("Acme");
  });

  it("requires auth to accept an invite", async () => {
    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createInvitesRoute(db));
      },
      db,
      null,
    );

    const response = await app.request("/invites/token-abc/accept", {
      method: "POST",
    });
    expect(response.status).toBe(401);
  });

  it("accepts invite for the signed-in user", async () => {
    acceptOrgInvite.mockResolvedValue({ orgSlug: "acme" });

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createInvitesRoute(db));
      },
      db,
      user,
    );

    const response = await app.request("/invites/token-abc/accept", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(acceptOrgInvite).toHaveBeenCalledWith(
      db,
      user.id,
      user.email,
      "token-abc",
    );
  });

  it("lists pending invites for the signed-in user", async () => {
    listMyPendingInvites.mockResolvedValue([]);

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createInvitesRoute(db));
      },
      db,
      user,
    );

    const response = await app.request("/me/invites");
    expect(response.status).toBe(200);
    expect(listMyPendingInvites).toHaveBeenCalledWith(db, user.email);
  });
});
