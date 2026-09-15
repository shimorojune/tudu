import type { Comment, Subtask, Task, TimelineEvent } from "@tudu/shared";
import type { CommentWithAuthor, TimelineEventWithActor } from "./activity.js";
import { mapProjectRef } from "./projects.js";
import type { SubtaskRow } from "./tasks-schema.js";
import type { TaskRowWithSubtasks } from "./tasks.js";

export function mapSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    done: row.done,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type MapTaskOptions = {
  hidePrivateProjects?: boolean;
};

export function mapTask(row: TaskRowWithSubtasks, options?: MapTaskOptions): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    scheduledDate: row.scheduledDate,
    bucket: row.bucket,
    position: row.position,
    startDate: row.startDate,
    deadline: row.deadline?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    inProgress: row.inProgress,
    carriedDays: row.carriedDays,
    carriedSince: row.carriedSince,
    isPrivate: row.isPrivate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    subtasks: row.subtasks.map(mapSubtask),
    commentCount: row.commentCount,
    project: mapProjectRef(row.project, {
      hidePrivate: options?.hidePrivateProjects,
    }),
    jiraLinks: row.jiraLinks ?? [],
  };
}

export function mapComment(row: CommentWithAuthor): Comment {
  return {
    id: row.id,
    taskId: row.taskId,
    authorId: row.authorId,
    body: row.body,
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: row.author,
  };
}

export function mapTimelineEvent(row: TimelineEventWithActor): TimelineEvent {
  return {
    id: row.id,
    taskId: row.taskId,
    actorId: row.actorId,
    actor: row.actor ?? null,
    type: row.type,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}
