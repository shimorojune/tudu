import { z } from "zod";
import { bucketSchema } from "./tasks.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

export const quickAddSuggestRequestSchema = z.object({
  titleForSave: z.string().min(1, "Title is required"),
  rawTitle: z.string().optional(),
  today: isoDateSchema,
  nowCount: z.number().int().min(0),
  scheduledDate: isoDateSchema.nullable(),
  parsedStartDate: isoDateSchema.nullable().optional().default(null),
  parsedDeadline: z.iso.datetime({ offset: true }).nullable().optional().default(null),
  parsedScheduledDate: isoDateSchema.nullable().optional().default(null),
});

export type QuickAddSuggestRequest = z.infer<typeof quickAddSuggestRequestSchema>;

export const quickAddSuggestResponseSchema = z.object({
  projectId: z.string().uuid().nullable(),
  bucket: bucketSchema.nullable(),
  matchedProjectName: z.string().nullable(),
  startDate: isoDateSchema.nullable(),
  deadline: z.iso.datetime({ offset: true }).nullable(),
  confidence: z
    .object({
      project: z.number().nullable(),
      bucket: z.number().nullable(),
      start: z.number().nullable(),
      deadline: z.number().nullable(),
    })
    .nullable(),
});

export type QuickAddSuggestResponse = z.infer<
  typeof quickAddSuggestResponseSchema
>;

export const QUICK_ADD_PROJECT_CONFIDENCE_MIN = 0.5;
export const QUICK_ADD_BUCKET_CONFIDENCE_MIN = 0.42;
export const QUICK_ADD_START_CONFIDENCE_MIN = 0.45;
export const QUICK_ADD_DEADLINE_CONFIDENCE_MIN = 0.45;
