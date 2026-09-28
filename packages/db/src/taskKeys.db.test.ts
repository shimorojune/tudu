import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  allocateNextTaskNumber,
  createDb,
  createOrg,
  createTask,
  ensureUserSpaceSettings,
  findTaskByKey,
  user,
} from "./index.js";

describe("taskKeys.db", () => {
  it("allocates monotonic numbers per personal space", async () => {
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

    const prefix = await ensureUserSpaceSettings(db, ownerId!);
    expect(prefix).toBe("ME");

    const first = await allocateNextTaskNumber(db, ownerId!, null);
    const second = await allocateNextTaskNumber(db, ownerId!, null);
    expect(second).toBe(first + 1);

    const suffix = crypto.randomUUID().slice(0, 8);
    const task = await createTask(db, {
      userId: ownerId!,
      title: `Key test ${suffix}`,
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: null,
      isPrivate: false,
    });

    const hit = await findTaskByKey(
      db,
      ownerId!,
      `${prefix}-${task.taskNumber}`,
    );
    expect(hit?.taskId).toBe(task.id);
  });

  it("allocates org-scoped numbers separately from personal", async () => {
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
      name: `Keys Org ${crypto.randomUUID().slice(0, 6)}`,
    });

    const personal = await allocateNextTaskNumber(db, ownerId!, null);
    const orgScoped = await allocateNextTaskNumber(db, ownerId!, org.id);
    expect(orgScoped).toBeGreaterThan(0);
    expect(personal).toBeGreaterThan(0);
  });
});
