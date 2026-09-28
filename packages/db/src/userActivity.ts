import { eq } from "drizzle-orm";
import type { Db } from "./index.js";
import { userActivity } from "./orgs-schema.js";

const THROTTLE_MS = 5 * 60 * 1000;

export async function touchUserActivity(
  db: Db,
  userId: string,
  at: Date = new Date(),
): Promise<void> {
  const existing = await db.query.userActivity.findFirst({
    where: eq(userActivity.userId, userId),
    columns: { lastSeenAt: true },
  });

  if (
    existing &&
    at.getTime() - existing.lastSeenAt.getTime() < THROTTLE_MS
  ) {
    return;
  }

  await db
    .insert(userActivity)
    .values({ userId, lastSeenAt: at })
    .onConflictDoUpdate({
      target: userActivity.userId,
      set: { lastSeenAt: at },
    });
}

export async function getUserLastSeen(
  db: Db,
  userId: string,
): Promise<Date | null> {
  const row = await db.query.userActivity.findFirst({
    where: eq(userActivity.userId, userId),
    columns: { lastSeenAt: true },
  });
  return row?.lastSeenAt ?? null;
}
