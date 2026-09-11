import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./tasks.js";
export * from "./activity.js";
export * from "./rollover.js";
export * from "./manager.js";
export * from "./sync.js";
export * from "./mapTask.js";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
