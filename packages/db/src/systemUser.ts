import type { Db } from "./index.js";
import { user } from "./auth-schema.js";
import { TUDU_SYSTEM_USER_ID } from "@tudu/shared";
import { eq } from "drizzle-orm";

export async function ensureSystemUser(db: Db): Promise<void> {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, TUDU_SYSTEM_USER_ID))
    .limit(1);
  if (existing[0]) {
    return;
  }
  await db.insert(user).values({
    id: TUDU_SYSTEM_USER_ID,
    name: "Tudu",
    email: "system@tudu.local",
    emailVerified: true,
  });
}
