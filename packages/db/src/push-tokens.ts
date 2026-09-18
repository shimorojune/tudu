import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./index.js";
import { pushDeviceTokens } from "./push-device-tokens-schema.js";

export async function upsertPushDeviceToken(
  db: Db,
  userId: string,
  token: string,
  platform = "web",
): Promise<void> {
  const existing = await db.query.pushDeviceTokens.findFirst({
    where: eq(pushDeviceTokens.token, token),
  });
  if (existing) {
    await db
      .update(pushDeviceTokens)
      .set({
        userId,
        platform,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pushDeviceTokens.token, token));
    return;
  }
  await db.insert(pushDeviceTokens).values({
    userId,
    token,
    platform,
  });
}

export async function softDeletePushDeviceToken(
  db: Db,
  userId: string,
  token: string,
): Promise<void> {
  await db
    .update(pushDeviceTokens)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(pushDeviceTokens.userId, userId),
        eq(pushDeviceTokens.token, token),
        isNull(pushDeviceTokens.deletedAt),
      ),
    );
}

export async function listPushDeviceTokensForUser(
  db: Db,
  userId: string,
): Promise<string[]> {
  const rows = await db.query.pushDeviceTokens.findMany({
    where: and(
      eq(pushDeviceTokens.userId, userId),
      isNull(pushDeviceTokens.deletedAt),
    ),
    columns: { token: true },
  });
  return rows.map((row) => row.token);
}

export async function softDeletePushDeviceTokenByValue(
  db: Db,
  token: string,
): Promise<void> {
  await db
    .update(pushDeviceTokens)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(pushDeviceTokens.token, token), isNull(pushDeviceTokens.deletedAt)),
    );
}
