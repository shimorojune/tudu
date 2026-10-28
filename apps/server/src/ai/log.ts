import { lt, schema, type Db } from '@tudu/db';
import type { Access } from './access';

/** Calls by keys and apps are kept this long, then trimmed. */
export const LOG_DAYS = 90;

/** One row per call a key or app makes, whatever the answer. Never what it sent or got. */
export async function logCall(
  db: Db,
  userId: string,
  a: Access,
  method: string,
  path: string,
  status: number,
): Promise<void> {
  await db
    .insert(schema.accessLog)
    .values({ userId, grantKind: a.kind, grantId: a.id, method, path, status });
}

/** Drops log rows older than 90 days. The hourly sweep runs it. */
export async function sweepAccessLog(db: Db, now = new Date()): Promise<number> {
  const gone = await db
    .delete(schema.accessLog)
    .where(lt(schema.accessLog.at, new Date(now.getTime() - LOG_DAYS * 86_400_000)))
    .returning({ id: schema.accessLog.id });
  return gone.length;
}
