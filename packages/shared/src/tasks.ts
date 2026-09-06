import { z } from "zod";

/** Bucket slots. These are stable ids, not labels: screen C1 lets the user rename
    what gets displayed, and a day that is not today may label them differently.
    See the step 3 open questions in docs/plans/README.md. */
export const BUCKETS = ["now", "next", "later"] as const;

export const bucketSchema = z.enum(BUCKETS);
export type Bucket = z.infer<typeof bucketSchema>;

/** Soft cap on Now. Nudged in the UI, never enforced by the API. Step 11 turns this
    into a preference in the 3 to 5 range. */
export const DEFAULT_NOW_SOFT_CAP = 5;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/** A task has a day and a bucket, or neither. Nothing in between is valid.
    The database enforces this too, with a check constraint. */
function dayAndBucketPaired(value: {
  scheduledDate: string | null;
  bucket: Bucket | null;
}) {
  return (value.scheduledDate === null) === (value.bucket === null);
}

const PAIRING_MESSAGE =
  "A task needs a day and a bucket together, or neither. Undated tasks belong to the Unscheduled backlog.";

export const subtaskSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  title: z.string(),
  done: z.boolean(),
  position: z.number().int(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Subtask = z.infer<typeof subtaskSchema>;

export const taskSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    scheduledDate: isoDateSchema.nullable(),
    bucket: bucketSchema.nullable(),
    position: z.number().int(),
    startDate: isoDateSchema.nullable(),
    deadline: z.iso.datetime({ offset: true }).nullable(),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    carriedDays: z.number().int(),
    carriedSince: isoDateSchema.nullable(),
    isPrivate: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    subtasks: z.array(subtaskSchema),
  })
  .refine(dayAndBucketPaired, { message: PAIRING_MESSAGE, path: ["bucket"] });

export type Task = z.infer<typeof taskSchema>;

export const createTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1, "A task needs a title").max(500),
    scheduledDate: isoDateSchema.nullable().default(null),
    bucket: bucketSchema.nullable().default(null),
    startDate: isoDateSchema.nullable().default(null),
    deadline: z.iso.datetime({ offset: true }).nullable().default(null),
    isPrivate: z.boolean().default(false),
  })
  .refine(dayAndBucketPaired, { message: PAIRING_MESSAGE, path: ["bucket"] });

export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const updateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    scheduledDate: isoDateSchema.nullable(),
    bucket: bucketSchema.nullable(),
    startDate: isoDateSchema.nullable(),
    deadline: z.iso.datetime({ offset: true }).nullable(),
    /** true stamps completedAt with now, false clears it. */
    completed: z.boolean(),
    isPrivate: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  })
  .refine(
    (value) => {
      const hasDate = "scheduledDate" in value;
      const hasBucket = "bucket" in value;

      if (!hasDate && !hasBucket) {
        return true;
      }

      if (hasDate !== hasBucket) {
        return false;
      }

      return (value.scheduledDate === null) === (value.bucket === null);
    },
    { message: PAIRING_MESSAGE, path: ["bucket"] },
  );

export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

/** One lane and its full new contents, in order. */
export const laneSchema = z
  .object({
    scheduledDate: isoDateSchema.nullable(),
    bucket: bucketSchema.nullable(),
    taskIds: z.array(z.uuid()),
  })
  .refine(dayAndBucketPaired, { message: PAIRING_MESSAGE, path: ["bucket"] });

export type Lane = z.infer<typeof laneSchema>;

export const reorderRequestSchema = z.object({
  lanes: z.array(laneSchema).min(1, "Send at least one lane"),
});

export type ReorderRequest = z.infer<typeof reorderRequestSchema>;

export const createSubtaskRequestSchema = z.object({
  title: z.string().trim().min(1, "A subtask needs a title").max(500),
});

export type CreateSubtaskRequest = z.infer<typeof createSubtaskRequestSchema>;

export const updateSubtaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    done: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export type UpdateSubtaskRequest = z.infer<typeof updateSubtaskRequestSchema>;

export const reorderSubtasksRequestSchema = z.object({
  subtaskIds: z.array(z.uuid()).min(1, "Send at least one subtask"),
});

export type ReorderSubtasksRequest = z.infer<typeof reorderSubtasksRequestSchema>;

export type TasksResponse = { tasks: Task[] };
export type TaskResponse = { task: Task };
