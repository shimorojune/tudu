import { describe, expect, it } from "vitest";
import { createDb } from "./index.js";
import { listInbox } from "./manager.js";
import { eq } from "drizzle-orm";
import { user } from "./auth-schema.js";

describe("manager db integration", () => {
  it("loads inbox rows for seeded test user", async () => {
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

    const testUser = rows[0];
    expect(testUser).toBeDefined();

    const inbox = await listInbox(db, testUser!.id);
    expect(Array.isArray(inbox.pending)).toBe(true);
    expect(Array.isArray(inbox.history)).toBe(true);
  });
});
