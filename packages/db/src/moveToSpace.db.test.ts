import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createDb,
  createOrg,
  createTask,
  moveTaskToSpace,
  MoveToSpaceError,
  user,
} from "./index.js";
import { orgAuditLog, timelineEvents } from "./schema.js";

describe("moveTaskToSpace.db", () => {
  it("moves a personal task into an org and writes audit and timeline", async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required (run via pnpm test:db)");
    }

    const db = createDb(databaseUrl);
    const rows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "testuser@egain.com"))
      .limit(1);
    const ownerId = rows[0]?.id;
    expect(ownerId).toBeDefined();

    const suffix = crypto.randomUUID().slice(0, 8);
    const org = await createOrg(db, ownerId!, {
      name: `Move Org ${suffix}`,
    });
    const task = await createTask(db, {
      userId: ownerId!,
      title: `Personal move ${suffix}`,
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: null,
      isPrivate: false,
    });

    await moveTaskToSpace(db, {
      userId: ownerId!,
      taskId: task.id,
      orgId: org.id,
      projectId: null,
      isPrivate: false,
    });

    const audit = await db.query.orgAuditLog.findFirst({
      where: and(
        eq(orgAuditLog.orgId, org.id),
        eq(orgAuditLog.kind, "task_moved_in"),
      ),
    });
    expect(audit?.kind).toBe("task_moved_in");

    const timeline = await db.query.timelineEvents.findMany({
      where: eq(timelineEvents.taskId, task.id),
    });
    expect(timeline.some((row) => row.type === "moved_to_space")).toBe(true);
  });

  it("rejects moving an org task", async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required (run via pnpm test:db)");
    }

    const db = createDb(databaseUrl);
    const rows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "testuser@egain.com"))
      .limit(1);
    const ownerId = rows[0]?.id;
    expect(ownerId).toBeDefined();

    const org = await createOrg(db, ownerId!, {
      name: `Move Org reject ${crypto.randomUUID().slice(0, 8)}`,
    });
    const task = await createTask(db, {
      userId: ownerId!,
      title: "Already org",
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: null,
      isPrivate: false,
      orgId: org.id,
    });

    await expect(
      moveTaskToSpace(db, {
        userId: ownerId!,
        taskId: task.id,
        orgId: org.id,
        projectId: null,
        isPrivate: false,
      }),
    ).rejects.toBeInstanceOf(MoveToSpaceError);
  });
});
