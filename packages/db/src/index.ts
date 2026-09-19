import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export * from "./schema.js";
export * from "./projects.js";
export * from "./tasks.js";
export * from "./activity.js";
export * from "./rollover.js";
export * from "./manager.js";
export * from "./sync.js";
export * from "./notifications.js";
export * from "./jira.js";
export * from "./mapTask.js";
export * from "./task-attachments.js";
export * from "./push-tokens.js";
export * from "./notificationPreferences.js";
export * from "./systemUser.js";
export * from "./jiraNotifications.js";
export * from "./reminderDelivery.js";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
