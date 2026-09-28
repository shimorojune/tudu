export type SlippingTaskInput = {
  carriedDays: number;
  deadline: Date | string | null;
  completedAt: Date | string | null;
};

export function isSlipping(task: SlippingTaskInput, now: Date): boolean {
  if (task.completedAt !== null) {
    return false;
  }
  if (task.carriedDays >= 2) {
    return true;
  }
  if (!task.deadline) {
    return false;
  }
  const deadline =
    typeof task.deadline === "string"
      ? new Date(task.deadline)
      : task.deadline;
  return deadline.getTime() < now.getTime();
}
