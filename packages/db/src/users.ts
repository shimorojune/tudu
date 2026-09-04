import { and, eq, isNull } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { users, type User } from "./schema.js";

type Db = NeonHttpDatabase<typeof schema>;

export type UpsertUserInput = {
  clerkUserId: string;
  email: string;
};

export async function findActiveUser(
  db: Db,
  clerkUserId: string,
): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.clerkUserId, clerkUserId), isNull(users.deletedAt)))
    .limit(1);

  return rows[0];
}

export async function upsertUser(
  db: Db,
  input: UpsertUserInput,
): Promise<User> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, input.clerkUserId))
    .limit(1);

  const now = new Date();

  if (existing[0]) {
    const updated = await db
      .update(users)
      .set({
        email: input.email,
        updatedAt: now,
        deletedAt: null,
      })
      .where(eq(users.clerkUserId, input.clerkUserId))
      .returning();

    return updated[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      clerkUserId: input.clerkUserId,
      email: input.email,
    })
    .returning();

  return inserted[0];
}

export async function softDeleteUser(
  db: Db,
  clerkUserId: string,
): Promise<void> {
  await db
    .update(users)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.clerkUserId, clerkUserId));
}
