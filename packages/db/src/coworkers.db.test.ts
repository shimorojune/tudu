import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  createOrg,
  createTask,
  getCoworkerDay,
  listCoworkerRoster,
  orgMembers,
  user,
} from "./index.js";
import { touchUserActivity } from "./userActivity.js";

describe("coworkers.db", () => {
  it("T3.1 roster and day exclude private tasks for other members", async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required (run via pnpm test:db)");
    }

    const db = createDb(databaseUrl);
    const ownerRows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "testuser@egain.com"))
      .limit(1);
    const peerRows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "marcus@egain.com"))
      .limit(1);
    const ownerId = ownerRows[0]?.id;
    const peerId = peerRows[0]?.id;
    expect(ownerId).toBeDefined();
    expect(peerId).toBeDefined();

    const suffix = crypto.randomUUID().slice(0, 8);
    const org = await createOrg(db, ownerId!, {
      name: `Coworkers ${suffix}`,
    });
    await db.insert(orgMembers).values({
      orgId: org.id,
      userId: peerId!,
      role: "member",
    });

    const date = "2099-01-15";
    await createTask(db, {
      userId: peerId!,
      title: "Visible org task",
      scheduledDate: date,
      bucket: "next",
      startDate: null,
      deadline: null,
      isPrivate: false,
      orgId: org.id,
    });
    await createTask(db, {
      userId: peerId!,
      title: "Hidden private",
      scheduledDate: date,
      bucket: "later",
      startDate: null,
      deadline: null,
      isPrivate: true,
      orgId: org.id,
    });

    const roster = await listCoworkerRoster(db, ownerId!, org.slug, date);
    const peerEntry = roster.members.find((m) => m.userId === peerId);
    expect(peerEntry?.openCount).toBe(1);

    const day = await getCoworkerDay(db, ownerId!, org.slug, peerId!, date);
    expect(day.privateHiddenCount).toBe(1);
    expect(day.tasks.map((t) => t.title)).toEqual(["Visible org task"]);

    await touchUserActivity(db, peerId!);
    const rosterAfter = await listCoworkerRoster(db, ownerId!, org.slug, date);
    const peerAfter = rosterAfter.members.find((m) => m.userId === peerId);
    expect(peerAfter?.lastSeenAt).toBeTruthy();
  });
});
