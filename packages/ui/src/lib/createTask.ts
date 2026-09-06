import type { Bucket, CreateTaskRequest } from "@tudu/shared";

export function createTaskBody(args: {
  title: string;
  scheduledDate?: string | null;
  bucket?: Bucket | null;
}): CreateTaskRequest {
  return {
    title: args.title,
    scheduledDate: args.scheduledDate ?? null,
    bucket: args.bucket ?? null,
    startDate: null,
    deadline: null,
    isPrivate: false,
  };
}
