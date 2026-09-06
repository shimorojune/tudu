import { z } from "zod";
import { TIMELINE_EVENT_TYPES } from "./timeline.js";

export const timelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES);

export const commentAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const commentSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  authorId: z.string(),
  body: z.string(),
  editedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  author: commentAuthorSchema,
});

export type Comment = z.infer<typeof commentSchema>;

export const timelineEventSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  actorId: z.string().nullable(),
  type: timelineEventTypeSchema,
  data: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime({ offset: true }),
});

export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const createCommentRequestSchema = z.object({
  body: z.string().trim().min(1, "A comment needs text").max(5000),
});

export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;

export const updateCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export type UpdateCommentRequest = z.infer<typeof updateCommentRequestSchema>;

export const timelineQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export type CommentsResponse = { comments: Comment[] };
export type CommentResponse = { comment: Comment };
export type TimelineResponse = {
  events: TimelineEvent[];
  hasMore: boolean;
};
