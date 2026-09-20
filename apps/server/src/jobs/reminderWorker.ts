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
  effectiveDayIsoInTimezone,
  isSlipping,
  localMinutesInTimezone,
} from "@tudu/shared";
import {
  fetchLatestRelease,
  resolveUpdatesReleaseChannelFromEnv,
} from "../routes/updates/github.js";
import { stripReleaseTag } from "../routes/updates/mapRelease.js";
import { insertSystemNotificationsWithPush } from "../notifications/delivery.js";

const LATE_WARMUP_KEY = "late:warmup:v1";

export function formatLateReminderBody(titles: string[]): string | null {
  const trimmed = titles.map((t) => t.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length === 1) {
    return `Running late: ${trimmed[0]}`;
  }
  const shown = trimmed.slice(0, 3);
  const rest = trimmed.length - shown.length;
  const list = shown.join(", ");
  if (rest > 0) {
    return `Running late: ${list}, and ${rest} more`;
  }
  return `Running late: ${list}`;
}

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

export async function runReminderCheck(db: Db, userId: string): Promise<number> {
  const prefs = await ensureNotificationPreferences(db, userId);
  if (!prefs.reminders) {
    return 0;
  }

  const now = new Date();
  let sent = 0;
  const effectiveDay = effectiveDayIsoInTimezone(prefs.timezone, DAY_START_HOUR, now);
  const tasks = await listIncompleteTasksForUser(db, userId);

  const digestMinutes = parseDigestMinutes(prefs.digestTimeLocal);
  const currentMinutes = localMinutesInTimezone(prefs.timezone, now);
  const digestKey = `digest:${effectiveDay}`;

  if (
    digestMinutes !== null &&
    currentMinutes >= digestMinutes &&
    currentMinutes < digestMinutes + 15
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
      const lines: string[] = [];
      if (todayNow.length > 0) {
        lines.push(
          `Working on: ${todayNow
            .slice(0, 3)
            .map((task) => task.title)
            .join(", ")}`,
        );
      }
      if (nextLater) {
        lines.push(`Next up: ${nextLater.title}`);
      }
      if (lines.length === 0) {
        lines.push("No tasks in focus. Check Today or Later.");
      }
      const body = lines.join(" ");
      await insertSystemNotificationsWithPush(db, {
        recipientUserIds: [userId],
        clientMutationId: null,
        kind: "reminder_digest",
        body,
        taskTitle: body.slice(0, 48),
      });
      await recordReminderDelivery(db, userId, digestKey, now);
      sent += 1;
    }
  }

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
      const body = formatLateReminderBody(lateDue.map((task) => task.title));
      if (body) {
        const primary = lateDue[0]!;
        await insertSystemNotificationsWithPush(db, {
          recipientUserIds: [userId],
          clientMutationId: null,
          kind: "reminder_late",
          body,
          taskTitle: primary.title,
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
      const body = `Due in ${threshold}h and not in progress: ${task.title}`;
      await insertSystemNotificationsWithPush(db, {
        recipientUserIds: [userId],
        clientMutationId: null,
        kind: "reminder_deadline",
        body,
        taskTitle: task.title,
        taskId: task.id,
        scheduledDate: task.scheduledDate,
      });
      await recordReminderDelivery(db, userId, key, now);
      sent += 1;
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
