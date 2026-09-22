export const DEFAULT_DEADLINE_LOCAL_HOUR = 18;

export function isoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function deadlineFromLocalParts(
  dateIso: string,
  hour = DEFAULT_DEADLINE_LOCAL_HOUR,
  minute = 0,
): string {
  const [year, month, day] = dateIso.split("-").map((part) => Number(part));
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  return local.toISOString();
}

export function deadlineFromChronoDate(date: Date): string {
  const hasTime =
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0;
  if (hasTime) {
    return date.toISOString();
  }
  return deadlineFromLocalParts(isoDateLocal(date));
}

export function startDateFromChronoDate(date: Date): string {
  return isoDateLocal(date);
}

export function validateStartBeforeDeadline(
  startDate: string | null,
  deadline: string | null,
): string | null {
  if (!startDate || !deadline) {
    return null;
  }
  const deadlineDay = isoDateLocal(new Date(deadline));
  if (startDate > deadlineDay) {
    return "Start must be on or before the deadline day";
  }
  return null;
}
