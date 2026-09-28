import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, createOrg, listSpacesForUser, user } from "./index.js";

describe("orgs db integration", () => {
  it("creates an org and lists it in spaces for the owner", async () => {
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

    const suffix = crypto.randomUUID().slice(0, 8);
    const org = await createOrg(db, testUser!.id, {
      name: `E2E Org ${suffix}`,
      color: "cobalt",
      joinLinkEnabled: false,
    });

    const spaces = await listSpacesForUser(db, testUser!.id);
    const created = spaces.find(
      (space) => space.kind === "org" && space.slug === org.slug,
    );
    expect(created).toBeDefined();
    expect(created?.role).toBe("owner");
  });
});
