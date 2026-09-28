import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PERSONAL_REQUESTS_SPACE } from "@tudu/shared";
import {
  createDb,
  createOrg,
  sendNewTaskRequest,
  listTaskRequestsForView,
  user,
  orgMembers,
} from "./index.js";

describe("requests db integration", () => {
  it("T4.2 send hides pending task from day lists", async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required (run via pnpm test:db)");
    }

    const db = createDb(databaseUrl);
    const users = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.email, "testuser@egain.com"))
      .limit(1);
    const sender = users[0];
    expect(sender).toBeDefined();

    const org = await createOrg(db, sender!.id, {
      name: `Req org ${crypto.randomUUID().slice(0, 8)}`,
      color: "cobalt",
      joinLinkEnabled: false,
    });

    const recipientRows = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "marcus@egain.com"))
      .limit(1);
    const recipient = recipientRows[0];
    expect(recipient).toBeDefined();

    await db.insert(orgMembers).values({
      orgId: org.id,
      userId: recipient!.id,
      role: "member",
    });

    const taskId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    await sendNewTaskRequest(db, sender!.id, {
      orgId: org.id,
      toUserId: recipient!.id,
      title: "Pending request task",
      description: null,
      requestId,
      taskId,
    });

    const views = await listTaskRequestsForView(
      db,
      recipient!.id,
      PERSONAL_REQUESTS_SPACE,
    );
    expect(views.some((row) => row.id === requestId)).toBe(true);
  });
});
