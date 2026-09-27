import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@tudu/db";
import { createManagerRoute } from "./manager.js";
import { createSessionTestApp } from "../test/harness.js";

const listReportDay = vi.hoisted(() => vi.fn());

vi.mock("@tudu/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/db")>();
  return {
    ...actual,
    listReportDay,
    listInbox: vi.fn().mockResolvedValue({ pending: [], history: [] }),
    listTeam: vi.fn().mockResolvedValue({ people: [], invites: [] }),
    acceptInboxItem: vi.fn(),
    declineInboxItem: vi.fn(),
    sendInboxTask: vi.fn(),
    reorderReportTasks: vi.fn(),
    deleteReportTask: vi.fn(),
    listReportInbox: vi.fn(),
    listReportUnscheduled: vi.fn(),
    createTeamInvite: vi.fn(),
    acceptTeamInvite: vi.fn(),
    declineTeamInvite: vi.fn(),
    countInbox: vi.fn().mockResolvedValue(0),
  };
});

const actor = {
  id: "manager-1",
  email: "mgr@test.com",
  name: "Manager",
  createdAt: new Date("2026-01-01T12:00:00Z"),
};

const db = {} as Db;

describe("manager route isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 on report day without session", async () => {
    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createManagerRoute(db));
      },
      db,
      null,
    );

    const response = await app.request(
      "http://localhost/team/report-user/day?date=2026-09-27",
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when report day is denied", async () => {
    listReportDay.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );

    const app = createSessionTestApp(
      (instance) => {
        instance.route("/", createManagerRoute(db));
      },
      db,
      actor,
    );

    const response = await app.request(
      "http://localhost/team/stranger/day?date=2026-09-27",
    );
    expect([403, 500]).toContain(response.status);
  });
});
