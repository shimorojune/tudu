export type LastSeenPhrase = {
  kind: "today" | "yesterday" | "older" | "never";
  timeLabel: string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function calendarDay(iso: string): string {
  return iso.slice(0, 10);
}

function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function lastSeenPhrase(
  lastSeenAt: Date | string | null,
  now: Date,
): LastSeenPhrase {
  if (!lastSeenAt) {
    return { kind: "never", timeLabel: null };
  }
  const seen =
    typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  const today = calendarDay(now.toISOString());
  const seenDay = calendarDay(seen.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDay = calendarDay(yesterday.toISOString());

  if (seenDay === today) {
    return { kind: "today", timeLabel: formatClock(seen) };
  }
  if (seenDay === yesterdayDay) {
    return { kind: "yesterday", timeLabel: formatClock(seen) };
  }
  return { kind: "older", timeLabel: formatClock(seen) };
}

export function formatLastSeenSubtitle(
  phrase: LastSeenPhrase,
  nowTitle: string | null,
): string {
  if (nowTitle) {
    return `now: ${nowTitle}`;
  }
  switch (phrase.kind) {
    case "never":
      return "hasn't opened Tudu yet";
    case "today":
      return `last seen today at ${phrase.timeLabel ?? ""}`;
    case "yesterday":
      return `hasn't opened Tudu today · last seen ${phrase.timeLabel ?? ""} yesterday`;
    case "older":
      return `last seen ${phrase.timeLabel ?? ""}`;
    default:
      return "";
  }
}
