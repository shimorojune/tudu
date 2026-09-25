import type { Db } from "@tudu/db";
import {
  ensureNotificationPreferences,
  getReminderDelivery,
  recordReminderDelivery,
} from "@tudu/db";
import {
  compareAppVersions,
  isNotificationKindEnabled,
} from "@tudu/shared";
import {
  fetchLatestRelease,
  resolveUpdatesReleaseChannelFromEnv,
} from "../routes/updates/github.js";
import { stripReleaseTag } from "../routes/updates/mapRelease.js";
import { insertSystemNotificationsWithPush } from "../notifications/delivery.js";

export async function runVersionCheck(db: Db, userId: string): Promise<number> {
  const prefs = await ensureNotificationPreferences(db, userId);
  if (!isNotificationKindEnabled(prefs, "app_update") || !prefs.clientAppVersion) {
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
