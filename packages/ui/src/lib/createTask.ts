import type { Bucket, CreateTaskRequest } from "@tudu/shared";

export function createTaskBody(args: {
  title: string;
  description?: string | null;
  scheduledDate?: string | null;
  bucket?: Bucket | null;
}): CreateTaskRequest {
  const trimmedDescription = args.description?.trim();
  return {
    title: args.title,
    description:
      trimmedDescription && trimmedDescription.length > 0
        ? trimmedDescription
        : null,
    scheduledDate: args.scheduledDate ?? null,
    bucket: args.bucket ?? null,
    startDate: null,
    deadline: null,
    isPrivate: false,
  };
}
