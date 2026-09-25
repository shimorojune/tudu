import type { NotificationPreferences } from "./notificationPreferences.js";
import { isNotificationKindEnabled } from "./notificationPreferences.js";

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

export function localDateIsoInTimezone(
  timezone: string,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function isWorkDay(
  prefs: Pick<NotificationPreferences, "timezone" | "workDays">,
  now: Date = new Date(),
): boolean {
  const weekday = localIsoWeekdayInTimezone(prefs.timezone, now);
  return prefs.workDays.includes(weekday);
}

export function isWithinWorkingHours(
  prefs: Pick<
    NotificationPreferences,
    "timezone" | "workHoursStart" | "workHoursEnd" | "workDays"
  >,
  now: Date = new Date(),
): boolean {
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

export type RegularSlot = {
  day: string;
  slotHm: string;
  slotStart: Date;
};

function formatHm(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function slotStartDate(
  timezone: string,
  dayIso: string,
  slotMinutes: number,
): Date {
  const hour = Math.floor(slotMinutes / 60);
  const minute = slotMinutes % 60;
  const utcGuess = new Date(`${dayIso}T${formatHm(slotMinutes)}:00.000Z`);
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).formatToParts(utcGuess);
  const offsetRaw = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetRaw);
  if (!match) {
    return new Date(`${dayIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const offHours = Number(match[2]);
  const offMins = Number(match[3] ?? "0");
  const offsetMinutes = sign * (offHours * 60 + offMins);
  const utcMs =
    Date.UTC(
      Number(dayIso.slice(0, 4)),
      Number(dayIso.slice(5, 7)) - 1,
      Number(dayIso.slice(8, 10)),
      hour,
      minute,
    ) - offsetMinutes * 60_000;
  return new Date(utcMs);
}

export function listRegularSlotStartsForDay(
  prefs: Pick<
    NotificationPreferences,
    "workHoursStart" | "workHoursEnd" | "regularIntervalMinutes"
  >,
): number[] {
  const start = parseHm(prefs.workHoursStart);
  const end = parseHm(prefs.workHoursEnd);
  if (!start || !end) {
    return [];
  }
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  if (startMin >= endMin) {
    return [];
  }
  const slots: number[] = [];
  for (let t = startMin; t < endMin; t += prefs.regularIntervalMinutes) {
    slots.push(t);
  }
  return slots;
}

export function regularSlotAt(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): RegularSlot | null {
  if (!isWithinWorkingHours(prefs, now)) {
    return null;
  }
  const current = localMinutesInTimezone(prefs.timezone, now);
  const slots = listRegularSlotStartsForDay(prefs);
  let active: number | null = null;
  for (const slotMin of slots) {
    if (current >= slotMin && current < slotMin + prefs.regularIntervalMinutes) {
      active = slotMin;
      break;
    }
  }
  if (active === null) {
    return null;
  }
  const day = localDateIsoInTimezone(prefs.timezone, now);
  return {
    day,
    slotHm: formatHm(active),
    slotStart: slotStartDate(prefs.timezone, day, active),
  };
}

export function nextRegularSlotStart(
  prefs: NotificationPreferences,
  now: Date = new Date(),
): Date {
  const timezone = prefs.timezone;
  const slots = listRegularSlotStartsForDay(prefs);
  if (slots.length === 0) {
    return new Date(now.getTime() + 60 * 60_000);
  }

  const tryDay = (dayIso: string, minCurrent: number): Date | null => {
    const weekday = localIsoWeekdayInTimezone(
      timezone,
      slotStartDate(timezone, dayIso, slots[0]!),
    );
    if (!prefs.workDays.includes(weekday)) {
      return null;
    }
    for (const slotMin of slots) {
      if (slotMin > minCurrent) {
        return slotStartDate(timezone, dayIso, slotMin);
      }
    }
    return null;
  };

  const today = localDateIsoInTimezone(timezone, now);
  const currentMin = localMinutesInTimezone(timezone, now);
  const todayNext = tryDay(today, currentMin);
  if (todayNext) {
    return todayNext;
  }

  let cursor = new Date(`${today}T12:00:00.000Z`);
  for (let i = 0; i < 14; i += 1) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
    const dayIso = localDateIsoInTimezone(timezone, cursor);
    const next = tryDay(dayIso, -1);
    if (next) {
      return next;
    }
  }

  return new Date(now.getTime() + prefs.regularIntervalMinutes * 60_000);
}

export const REGULAR_SLOT_STALE_MS = 5 * 60_000;

export function isRegularSlotStale(slot: RegularSlot, now: Date = new Date()): boolean {
  return now.getTime() - slot.slotStart.getTime() > REGULAR_SLOT_STALE_MS;
}

export function shouldSendPushForNotification(
  prefs: NotificationPreferences,
  kind: string,
  _now: Date = new Date(),
): boolean {
  if (!prefs.osEnabled) {
    return false;
  }
  return isNotificationKindEnabled(prefs, kind);
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
