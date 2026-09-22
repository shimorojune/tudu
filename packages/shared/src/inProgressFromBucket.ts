import type { Bucket } from "./tasks.js";

/** True only for today's open-work Now lane (not Priority 1 on other days). */
export function inProgressForPlacement(
  bucket: Bucket | null,
  scheduledDate: string | null,
  today: string,
): boolean {
  return bucket === "now" && scheduledDate === today;
}

/** @deprecated Use inProgressForPlacement with scheduledDate and today. */
export function inProgressFromBucket(bucket: Bucket | null): boolean {
  return bucket === "now";
}
