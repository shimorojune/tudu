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
  formatDeadlinePresentation,
  formatDigestPresentation,
  formatFocusCheckInPresentation,
  formatLateSlippingPresentation,
  focusSnapshotHash,
  isSlipping,
  localMinutesInTimezone,
  presentationToBody,
} from "@tudu/shared";
import {
  fetchLatestRelease,
  resolveUpdatesReleaseChannelFromEnv,
} from "../routes/updates/github.js";
import { stripReleaseTag } from "../routes/updates/mapRelease.js";
import { insertSystemNotificationsWithPush } from "../notifications/delivery.js";

const LATE_WARMUP_KEY = "late:warmup:v1";

function parseDigestMinutes(digestTimeLocal: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(digestTimeLocal.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function digestTimeInsideWorkWindow(
  digestMinutes: number,
  prefs: Awaited<ReturnType<typeof ensureNotificationPreferences>>,
): boolean {
  if (!prefs.workHoursEnabled) {
    return true;
  }
  const start = parseDigestMinutes(prefs.workHoursStart);
  const end = parseDigestMinutes(prefs.workHoursEnd);
  if (start === null || end === null) {
    return true;
  }
  if (start < end) {
    return digestMinutes >= start && digestMinutes < end;
  }
  return digestMinutes >= start || digestMinutes < end;
}

async function insertReminderNotification(
  db: Db,
  args: {
    userId: string;
    kind: "reminder_focus" | "reminder_digest" | "reminder_late" | "reminder_deadline";
    presentation: ReturnType<typeof formatFocusCheckInPresentation>;
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
    kind: args.kind,
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

export async function runReminderCheck(db: Db, userId: string): Promise<number> {
  const prefs = await ensureNotificationPreferences(db, userId);
  if (!prefs.reminders) {
    return 0;
  }

  const now = new Date();
  if (!canRunScheduledReminders(prefs, now)) {
    return 0;
  }

  let sent = 0;
  const effectiveDay = effectiveDayIsoInTimezone(prefs.timezone, DAY_START_HOUR, now);
  const tasks = await listIncompleteTasksForUser(db, userId);

  const digestMinutes = parseDigestMinutes(prefs.digestTimeLocal);
  const currentMinutes = localMinutesInTimezone(prefs.timezone, now);
  const digestKey = `digest:${effectiveDay}`;

  if (
    prefs.remindersDigest &&
    digestMinutes !== null &&
    currentMinutes >= digestMinutes &&
    currentMinutes < digestMinutes + 15 &&
    digestTimeInsideWorkWindow(digestMinutes, prefs)
  ) {
    const already = await wasReminderSentAfter(
      db,
      userId,
      digestKey,
      new Date(now.getTime() - 20 * 60 * 60 * 1000),
    );
    if (!already) {
      const todayNow = tasks.filter(
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
      const presentation = formatDigestPresentation({
        workingOn: todayNow.map((task) => task.title),
        nextUp: nextLater?.title ?? null,
      });
      const primary = todayNow[0];
      await insertReminderNotification(db, {
        userId,
        kind: "reminder_digest",
        presentation,
        taskId: primary?.id ?? null,
        scheduledDate: primary?.scheduledDate ?? effectiveDay,
      });
      await recordReminderDelivery(db, userId, digestKey, now);
      sent += 1;
    }
  }

  if (prefs.remindersFocus) {
    const focusKeyBase = `focus:snapshot:${effectiveDay}`;
    const notBeforeFocus = new Date(
      now.getTime() - prefs.focusCheckInMinutes * 60 * 1000,
    );
    const inProgressToday = tasks.filter(
      (task) =>
        task.scheduledDate === effectiveDay &&
        task.bucket === "now" &&
        task.inProgress,
    );
    const snapshot = focusSnapshotHash(inProgressToday.map((task) => task.id));
    const focusKey = `${focusKeyBase}:${snapshot}`;
    const alreadyFocus = await wasReminderSentAfter(
      db,
      userId,
      focusKey,
      notBeforeFocus,
    );
    if (!alreadyFocus) {
      const presentation = formatFocusCheckInPresentation(
        inProgressToday.map((task) => task.title),
      );
      const primary = inProgressToday[0];
      await insertReminderNotification(db, {
        userId,
        kind: "reminder_focus",
        presentation,
        taskId: primary?.id ?? null,
        scheduledDate: primary?.scheduledDate ?? effectiveDay,
        metadata: {
          taskIds: inProgressToday.map((task) => task.id),
          count: inProgressToday.length,
          snapshotHash: snapshot,
        },
      });
      await recordReminderDelivery(db, userId, focusKey, now);
      sent += 1;
    }
  }

  if (prefs.remindersSlipping) {
    const notBeforeLate = new Date(
      now.getTime() - prefs.lateReminderMinutes * 60 * 1000,
    );
    const lateDue = [];
    for (const task of tasks) {
      const slipping = isSlipping({
        carriedDays: task.carriedDays ?? 0,
        deadline: task.deadline?.toISOString() ?? null,
        now,
      });
      if (!slipping) {
        continue;
      }
      const already = await wasReminderSentAfter(
        db,
        userId,
        `late:${task.id}`,
        notBeforeLate,
      );
      if (!already) {
        lateDue.push(task);
      }
    }

    if (lateDue.length > 0) {
      const warmupRow = await getReminderDelivery(db, userId, LATE_WARMUP_KEY);
      const priorDeliveries = await Promise.all(
        lateDue.map((task) => getReminderDelivery(db, userId, `late:${task.id}`)),
      );
      const isInitialBacklog =
        !warmupRow && priorDeliveries.every((row) => !row);

      if (isInitialBacklog) {
        for (const task of lateDue) {
          await recordReminderDelivery(db, userId, `late:${task.id}`, now);
        }
        await recordReminderDelivery(db, userId, LATE_WARMUP_KEY, now);
      } else {
        if (!warmupRow) {
          await recordReminderDelivery(db, userId, LATE_WARMUP_KEY, now);
        }
        const presentation = formatLateSlippingPresentation(
          lateDue.map((task) => task.title),
        );
        if (presentation) {
          const primary = lateDue[0]!;
          await insertReminderNotification(db, {
            userId,
            kind: "reminder_late",
            presentation,
            taskId: primary.id,
            scheduledDate: primary.scheduledDate,
            metadata: {
              taskIds: lateDue.map((task) => task.id),
              count: lateDue.length,
            },
          });
          for (const task of lateDue) {
            await recordReminderDelivery(db, userId, `late:${task.id}`, now);
          }
          sent += 1;
        }
      }
    }
  }

  if (prefs.remindersDeadline) {
    for (const task of tasks) {
      if (!task.deadline || task.inProgress) {
        continue;
      }
      const msUntil = task.deadline.getTime() - now.getTime();
      if (msUntil <= 0) {
        continue;
      }
      const hoursUntil = msUntil / 3_600_000;
      for (const threshold of prefs.deadlineNudgeHours) {
        if (hoursUntil > threshold || hoursUntil < threshold - 0.5) {
          continue;
        }
        const key = `deadline:${task.id}:${threshold}h`;
        const already = await wasReminderSentAfter(
          db,
          userId,
          key,
          new Date(now.getTime() - threshold * 3_600_000),
        );
        if (already) {
          continue;
        }
        const presentation = formatDeadlinePresentation(threshold, task.title);
        await insertReminderNotification(db, {
          userId,
          kind: "reminder_deadline",
          presentation,
          taskId: task.id,
          scheduledDate: task.scheduledDate,
        });
        await recordReminderDelivery(db, userId, key, now);
        sent += 1;
      }
    }
  }

  return sent;
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
