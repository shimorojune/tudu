import type { Bucket } from "@tudu/shared";

const TODAY_LABELS: Record<Bucket, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

const OTHER_DAY_LABELS: Record<Bucket, string> = {
  now: "Priority 1",
  next: "Priority 2",
  later: "Priority 3",
};

export function bucketLabel(bucket: Bucket, isToday: boolean): string {
  return isToday ? TODAY_LABELS[bucket] : OTHER_DAY_LABELS[bucket];
}

export function isSelectedDateToday(selectedDate: string, today: string): boolean {
  return selectedDate === today;
}
