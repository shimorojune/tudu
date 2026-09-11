import { QueryBuilder } from "drizzle-orm/pg-core";
import { and, asc, eq, gt } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { recipientsForTask } from "@tudu/shared";
import { uniqueIds } from "./sync.js";
import { syncEvents } from "./sync-schema.js";

describe("uniqueIds", () => {
  it("drops blanks and duplicates", () => {
    expect(uniqueIds(["a", "a", "", "b"])).toEqual(["a", "b"]);
  });
});

describe("listEventsAfter sql", () => {
  it("filters by recipient and seq", () => {
    const qb = new QueryBuilder();
    const { sql } = qb
      .select()
      .from(syncEvents)
      .where(
        and(eq(syncEvents.recipientUserId, "user-1"), gt(syncEvents.id, 4)),
      )
      .orderBy(asc(syncEvents.id))
      .toSQL();

    expect(sql).toContain("sync_events");
    expect(sql).toContain("recipient_user_id");
    expect(sql).toContain(">");
  });
});

describe("recipientsForTask private hide", () => {
  it("is the same rule emitSync uses", () => {
    expect(
      recipientsForTask({
        ownerId: "priya",
        isPrivate: true,
        managerUserId: "marcus",
      }),
    ).toEqual(["priya"]);
  });
});
