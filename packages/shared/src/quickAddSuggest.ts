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
});

export type QuickAddSuggestRequest = z.infer<typeof quickAddSuggestRequestSchema>;

export const quickAddSuggestResponseSchema = z.object({
  projectId: z.string().uuid().nullable(),
  bucket: bucketSchema.nullable(),
  matchedProjectName: z.string().nullable(),
  confidence: z
    .object({
      project: z.number().nullable(),
      bucket: z.number().nullable(),
    })
    .nullable(),
});

export type QuickAddSuggestResponse = z.infer<
  typeof quickAddSuggestResponseSchema
>;

export const QUICK_ADD_PROJECT_CONFIDENCE_MIN = 0.5;
export const QUICK_ADD_BUCKET_CONFIDENCE_MIN = 0.42;
