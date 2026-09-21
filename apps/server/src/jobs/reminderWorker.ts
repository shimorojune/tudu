import type { Db } from "@tudu/db";
import {
  ensureNotificationPreferences,
  getReminderDelivery,
  listIncompleteTasksForUser,
  recordReminderDelivery,
  wasReminderSentAfter,
} from "@tudu/db";
import {
  compareAppVersions,
  DAY_START_HOUR,
  canRunScheduledReminders,
  effectiveDayIsoInTimezone,
  formatLateSlippingPresentation,
  formatWorkCheckInPresentation,
  focusSnapshotHash,
  isSlipping,
  presentationToBody,
  type NotificationPresentation,
} from "@tudu/shared";
import {
  fetchLatestRelease,
  resolveUpdatesReleaseChannelFromEnv,
} from "../routes/updates/github.js";
import { stripReleaseTag } from "../routes/updates/mapRelease.js";
import { insertSystemNotificationsWithPush } from "../notifications/delivery.js";

async function insertReminderNotification(
  db: Db,
  args: {
    userId: string;
    presentation: NotificationPresentation;
    taskId?: string | null;
    scheduledDate?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const body = presentationToBody(args.presentation);
  const taskTitle = args.presentation.title.slice(0, 48);
  await insertSystemNotificationsWithPush(db, {
    recipientUserIds: [args.userId],
    clientMutationId: null,
    kind: "reminder_focus",
    body,
    taskTitle,
    taskId: args.taskId ?? null,
    scheduledDate: args.scheduledDate ?? null,
    metadata: {
      ...args.metadata,
      presentation: args.presentation,
    },
  });
}

function nearestUpcomingDeadline(
  tasks: Awaited<ReturnType<typeof listIncompleteTasksForUser>>,
  now: Date,
): { hours: number; title: string } | null {
  let best: { hours: number; title: string } | null = null;
  for (const task of tasks) {
    if (!task.deadline || task.inProgress) {
      continue;
    }
    const msUntil = task.deadline.getTime() - now.getTime();
    if (msUntil <= 0) {
      continue;
    }
    const hours = msUntil / 3_600_000;
    if (!best || hours < best.hours) {
      best = { hours, title: task.title };
    }
  }
  return best;
}

export async function runReminderCheck(db: Db, userId: string): Promise<number> {
  const prefs = await ensureNotificationPreferences(db, userId);
  if (!prefs.reminders) {
    return 0;
  }

  const now = new Date();
  if (!canRunScheduledReminders(prefs, now)) {
    return 0;
  }

  const effectiveDay = effectiveDayIsoInTimezone(prefs.timezone, DAY_START_HOUR, now);
  const tasks = await listIncompleteTasksForUser(db, userId);

  const inProgressToday = tasks.filter(
    (task) =>
      task.scheduledDate === effectiveDay &&
      task.bucket === "now" &&
      task.inProgress,
  );
  const nextLater = tasks.find(
    (task) =>
      task.bucket === "later" ||
      (task.scheduledDate && task.scheduledDate > effectiveDay),
  );

  let slippingCount = 0;
  for (const task of tasks) {
    if (
      isSlipping({
        carriedDays: task.carriedDays ?? 0,
        deadline: task.deadline?.toISOString() ?? null,
        now,
      })
    ) {
      slippingCount += 1;
    }
  }

  const nearest = nearestUpcomingDeadline(tasks, now);

  const snapshot = focusSnapshotHash(inProgressToday.map((task) => task.id));
  const checkInKey = `checkin:${effectiveDay}:${snapshot}`;
  const notBefore = new Date(now.getTime() - prefs.focusCheckInMinutes * 60 * 1000);
  const already = await wasReminderSentAfter(db, userId, checkInKey, notBefore);
  if (already) {
    return 0;
  }

  const presentation = formatWorkCheckInPresentation({
    inProgress: inProgressToday.map((task) => task.title),
    nextUp: nextLater?.title ?? null,
    slippingCount,
    nearestDeadlineHours: nearest?.hours ?? null,
    nearestDeadlineTitle: nearest?.title ?? null,
  });
  const primary = inProgressToday[0];
  await insertReminderNotification(db, {
    userId,
    presentation,
    taskId: primary?.id ?? null,
    scheduledDate: primary?.scheduledDate ?? effectiveDay,
    metadata: {
      taskIds: inProgressToday.map((task) => task.id),
      count: inProgressToday.length,
      snapshotHash: snapshot,
      slippingCount,
    },
  });
  await recordReminderDelivery(db, userId, checkInKey, now);
  return 1;
}

export async function runVersionCheck(db: Db, userId: string): Promise<number> {
  const prefs = await ensureNotificationPreferences(db, userId);
  if (!prefs.appUpdate || !prefs.clientAppVersion) {
    return 0;
  }

  const token = process.env.UPDATES_GITHUB_TOKEN?.trim();
  const repo =
    process.env.UPDATES_GITHUB_REPO?.trim() || "eGainDev/tudu";
  if (!token) {
    return 0;
  }

  const release = await fetchLatestRelease({
    token,
    repo,
    channel: resolveUpdatesReleaseChannelFromEnv(),
  });
  const latest = stripReleaseTag(release.tag_name);
  if (compareAppVersions(latest, prefs.clientAppVersion) <= 0) {
    return 0;
  }

  const deliveryKey = `app_update:${latest}`;
  const existing = await getReminderDelivery(db, userId, deliveryKey);
  if (existing) {
    return 0;
  }

  const body = `Version ${latest} is available (you have ${prefs.clientAppVersion})`;
  await insertSystemNotificationsWithPush(db, {
    recipientUserIds: [userId],
    clientMutationId: null,
    kind: "app_update",
    body,
    taskTitle: `Update to ${latest}`,
    appVersion: latest,
  });
  await recordReminderDelivery(db, userId, deliveryKey, new Date());
  return 1;
}

// Kept for tests that imported formatLateReminderBody
export function formatLateReminderBody(titles: string[]): string | null {
  const presentation = formatLateSlippingPresentation(titles);
  return presentation ? presentationToBody(presentation) : null;
}
