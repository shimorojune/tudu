import type { Bucket, CreateTaskRequest } from "@tudu/shared";

export function createTaskBody(args: {
  title: string;
  description?: string | null;
  scheduledDate?: string | null;
  bucket?: Bucket | null;
  startDate?: string | null;
  deadline?: string | null;
  projectId?: string | null;
}): CreateTaskRequest {
  const trimmedDescription = args.description?.trim();
  const startDate = args.startDate?.trim() || null;
  return {
    title: args.title,
    description:
      trimmedDescription && trimmedDescription.length > 0
        ? trimmedDescription
        : null,
    scheduledDate: args.scheduledDate ?? null,
    bucket: args.bucket ?? null,
    startDate,
    deadline: args.deadline ?? null,
    isPrivate: false,
    projectId: args.projectId ?? null,
  };
}
