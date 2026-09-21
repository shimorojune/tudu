import {
  isNotificationKindEnabled,
  SCHEDULED_REMINDER_KINDS,
  type NotificationPreferences,
} from "./notificationPreferences.js";

export function parseHm(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

export function localMinutesInTimezone(timezone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isWithinQuietHours(
  prefs: Pick<NotificationPreferences, "timezone" | "quietHoursStart" | "quietHoursEnd">,
  now: Date = new Date(),
): boolean {
  const start = parseHm(prefs.quietHoursStart);
  const end = parseHm(prefs.quietHoursEnd);
  if (!start || !end) {
    return false;
  }
  const current = localMinutesInTimezone(prefs.timezone, now);
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  if (startMin === endMin) {
    return false;
  }
  if (startMin < endMin) {
    return current >= startMin && current < endMin;
  }
  return current >= startMin || current < endMin;
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

export function localIsoWeekdayInTimezone(
  timezone: string,
  now: Date = new Date(),
): number {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(now);
  return WEEKDAY_TO_ISO[day] ?? 1;
}

export function isWorkDay(
  prefs: Pick<NotificationPreferences, "timezone" | "workDays" | "workHoursEnabled">,
  now: Date = new Date(),
): boolean {
  if (!prefs.workHoursEnabled) {
    return true;
  }
  const weekday = localIsoWeekdayInTimezone(prefs.timezone, now);
  return prefs.workDays.includes(weekday);
}

export function isWithinWorkingHours(
  prefs: Pick<
    NotificationPreferences,
    | "timezone"
    | "workHoursEnabled"
    | "workHoursStart"
    | "workHoursEnd"
    | "workDays"
  >,
  now: Date = new Date(),
): boolean {
  if (!prefs.workHoursEnabled) {
    return true;
  }
  if (!isWorkDay(prefs, now)) {
    return false;
  }
  const start = parseHm(prefs.workHoursStart);
  const end = parseHm(prefs.workHoursEnd);
  if (!start || !end) {
    return true;
  }
  const current = localMinutesInTimezone(prefs.timezone, now);
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  if (startMin === endMin) {
    return false;
  }
  if (startMin < endMin) {
    return current >= startMin && current < endMin;
  }
  return current >= startMin || current < endMin;
}

export function canRunScheduledReminders(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  return isWithinWorkingHours(prefs, now);
}

export function canDeliverScheduledReminderPush(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): boolean {
  return canRunScheduledReminders(prefs, now);
}

function isScheduledReminderKind(kind: string): boolean {
  return (SCHEDULED_REMINDER_KINDS as readonly string[]).includes(kind);
}

export function shouldSendPushForNotification(
  prefs: NotificationPreferences,
  kind: string,
  now: Date = new Date(),
): boolean {
  if (!isNotificationKindEnabled(prefs, kind)) {
    return false;
  }
  if (!prefs.osEnabled) {
    return false;
  }
  if (isScheduledReminderKind(kind)) {
    return canDeliverScheduledReminderPush(prefs, now);
  }
  return true;
}

export function compareAppVersions(latest: string, current: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((part) => Number.parseInt(part.replace(/\D/g, ""), 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) {
      return 1;
    }
    if (av < bv) {
      return -1;
    }
  }
  return 0;
}

export function effectiveDayIsoInTimezone(
  timezone: string,
  dayStartHour: number,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  let date = new Date(`${year}-${month}-${day}T12:00:00`);
  if (hour < dayStartHour) {
    date.setDate(date.getDate() - 1);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
