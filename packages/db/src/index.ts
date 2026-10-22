import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export { schema };
// One copy of the ORM for every package: operators come from here, never from a second drizzle-orm.
export {
  and,
  asc,
  cosineDistance,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

/** A Drizzle client over a small connection pool. Call `close()` when the process ends. */
export function createDb(
  url: string,
  options: { max?: number } = {},
): { db: Db; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 8 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, close: () => pool.end() };
}
