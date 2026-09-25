import type { Db } from "@tudu/db";
import {
  deleteReminderDelivery,
  ensureNotificationPreferences,
  getReminderDelivery,
  listIncompleteTasksForUser,
  recordReminderDelivery,
} from "@tudu/db";
import {
  DAY_START_HOUR,
  effectiveDayIsoInTimezone,
  formatAllDonePresentation,
  formatRegularPresentation,
  isRegularSlotStale,
  regularSlotAt,
} from "@tudu/shared";
import { emitRegularPulse } from "../notifications/pulse.js";

function countTodayByBucket(
  tasks: Awaited<ReturnType<typeof listIncompleteTasksForUser>>,
  effectiveDay: string,
): { now: number; next: number; later: number } {
  const counts = { now: 0, next: 0, later: 0 };
  for (const task of tasks) {
    if (task.scheduledDate !== effectiveDay) {
      continue;
    }
    if (task.bucket === "now") {
      counts.now += 1;
    } else if (task.bucket === "next") {
      counts.next += 1;
    } else if (task.bucket === "later") {
      counts.later += 1;
    }
  }
  return counts;
}

export async function runRegularCheck(db: Db, userId: string): Promise<number> {
  const prefs = await ensureNotificationPreferences(db, userId);
  if (!prefs.regularEnabled) {
    return 0;
  }

  const now = new Date();
  const slot = regularSlotAt(prefs, now);
  if (!slot) {
    return 0;
  }

  if (isRegularSlotStale(slot, now)) {
    const slotKey = `regular:slot:${slot.day}:${slot.slotHm}`;
    await recordReminderDelivery(db, userId, slotKey, now);
    return 0;
  }

  const slotKey = `regular:slot:${slot.day}:${slot.slotHm}`;
  const already = await getReminderDelivery(db, userId, slotKey);
  if (already) {
    return 0;
  }

  const effectiveDay = effectiveDayIsoInTimezone(prefs.timezone, DAY_START_HOUR, now);
  const tasks = await listIncompleteTasksForUser(db, userId);
  const buckets = countTodayByBucket(tasks, effectiveDay);
  const total = buckets.now + buckets.next + buckets.later;

  const doneKey = `regular:done:${effectiveDay}`;

  if (total > 0) {
    await deleteReminderDelivery(db, userId, doneKey);
    const presentation = formatRegularPresentation(buckets);
    await emitRegularPulse(db, { userId, presentation, sentAt: now });
    await recordReminderDelivery(db, userId, slotKey, now);
    return 1;
  }

  const doneSent = await getReminderDelivery(db, userId, doneKey);
  if (doneSent) {
    await recordReminderDelivery(db, userId, slotKey, now);
    return 0;
  }

  await emitRegularPulse(db, {
    userId,
    presentation: formatAllDonePresentation(),
    sentAt: now,
  });
  await recordReminderDelivery(db, userId, doneKey, now);
  await recordReminderDelivery(db, userId, slotKey, now);
  return 1;
}
