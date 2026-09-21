import type { Db } from "@tudu/db";
import { sql } from "drizzle-orm";
import { getJiraConnection, getNotificationPreferences, listUsersDueForJiraPoll,
  listUsersDueForReminderCheck,
  listUsersDueForVersionCheck,
  scheduleNextJiraPoll,
  scheduleNextReminderCheck,
  scheduleNextVersionCheck,
} from "@tudu/db";
import { DEFAULT_JIRA_POLL_IDLE_MINUTES } from "@tudu/shared";
import { runJiraNotificationPoll } from "./jiraNotificationWorker.js";
import { runReminderCheck, runVersionCheck } from "./reminderWorker.js";

const TICK_MS = 60_000;
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const BATCH_SIZE = 20;
const REMINDER_INTERVAL_MS = 5 * 60 * 1000;
const VERSION_INTERVAL_MS = 6 * 60 * 60 * 1000;

let tickInFlight = false;

const NOTIFICATION_JOB_LOCK_KEY = 83472901;

async function withJobLock(db: Db, fn: () => Promise<void>): Promise<void> {
  if (tickInFlight) {
    return;
  }
  tickInFlight = true;
  let locked = false;
  try {
    const result = await db.execute(
      sql`SELECT pg_try_advisory_lock(${NOTIFICATION_JOB_LOCK_KEY}) AS locked`,
    );
    const rows = Array.isArray(result) ? result : result.rows;
    const row = rows[0] as { locked?: boolean } | undefined;
    locked = row?.locked === true;
    if (!locked) {
      return;
    }
    await fn();
  } finally {
    if (locked) {
      await db.execute(
        sql`SELECT pg_advisory_unlock(${NOTIFICATION_JOB_LOCK_KEY})`,
      );
    }
    tickInFlight = false;
  }
}

function jiraPollDelayMinutes(
  prefs: Awaited<ReturnType<typeof getNotificationPreferences>>,
  now: Date,
): number {
  if (!prefs) {
    return DEFAULT_JIRA_POLL_IDLE_MINUTES;
  }
  const lastActive = prefs.lastActiveAt
    ? new Date(prefs.lastActiveAt).getTime()
    : 0;
  const active = lastActive > 0 && now.getTime() - lastActive <= ACTIVE_WINDOW_MS;
  return active ? prefs.jiraPollActiveMinutes : prefs.jiraPollIdleMinutes;
}

async function runTick(db: Db): Promise<void> {
  const now = new Date();

  const jiraUsers = await listUsersDueForJiraPoll(db, now, BATCH_SIZE);
  for (const row of jiraUsers) {
    const connected = await getJiraConnection(db, row.userId);
    if (!connected) {
      await scheduleNextJiraPoll(
        db,
        row.userId,
        new Date(now.getTime() + DEFAULT_JIRA_POLL_IDLE_MINUTES * 60 * 1000),
        now,
      );
      continue;
    }
    try {
      await runJiraNotificationPoll(db, row.userId);
    } catch (error) {
      console.error("[notification-jobs] jira poll failed", row.userId, error);
    }
    const prefs = await getNotificationPreferences(db, row.userId);
    const delayMin = jiraPollDelayMinutes(prefs, now);
    await scheduleNextJiraPoll(
      db,
      row.userId,
      new Date(now.getTime() + delayMin * 60 * 1000),
      now,
    );
  }

  const reminderUsers = await listUsersDueForReminderCheck(db, now, BATCH_SIZE);
  for (const row of reminderUsers) {
    try {
      await runReminderCheck(db, row.userId);
    } catch (error) {
      console.error("[notification-jobs] reminders failed", row.userId, error);
    }
    await scheduleNextReminderCheck(
      db,
      row.userId,
      new Date(now.getTime() + REMINDER_INTERVAL_MS),
    );
  }

  const versionUsers = await listUsersDueForVersionCheck(db, now, BATCH_SIZE);
  for (const row of versionUsers) {
    try {
      await runVersionCheck(db, row.userId);
    } catch (error) {
      console.error("[notification-jobs] version failed", row.userId, error);
    }
    await scheduleNextVersionCheck(
      db,
      row.userId,
      new Date(now.getTime() + VERSION_INTERVAL_MS),
    );
  }
}

export function startNotificationScheduler(db: Db): void {
  if (process.env.NOTIFICATION_JOBS_ENABLED === "false") {
    return;
  }

  const tick = () => {
    void withJobLock(db, () => runTick(db)).catch((error) => {
      console.error("[notification-jobs] tick failed", error);
    });
  };

  tick();
  setInterval(tick, TICK_MS);
}
