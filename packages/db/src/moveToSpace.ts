import { and, eq, isNull } from "drizzle-orm";
import { assertMemberIds } from "./access.js";
import { insertTimelineEvents } from "./activity.js";
import type { Db } from "./index.js";
import { assertNowCapForCreate, NowCapExceededError } from "./nowCap.js";
import { orgAuditLog } from "./orgs-schema.js";
import { projects } from "./projects-schema.js";
import { findTaskById } from "./tasks.js";
import { tasks } from "./tasks-schema.js";

export class MoveToSpaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MoveToSpaceError";
  }
}

export type MoveTaskToSpaceInput = {
  userId: string;
  taskId: string;
  orgId: string;
  projectId: string | null;
  isPrivate: boolean;
};

export async function moveTaskToSpace(
  db: Db,
  input: MoveTaskToSpaceInput,
): Promise<void> {
  const task = await findTaskById(db, input.userId, input.taskId);
  if (!task) {
    throw new MoveToSpaceError("TASK_NOT_FOUND", "Task not found", 404);
  }
  if (task.orgId !== null) {
    throw new MoveToSpaceError(
      "ALREADY_IN_ORG",
      "Task is already in an organization",
      422,
    );
  }
  if (task.pendingRequestId) {
    throw new MoveToSpaceError(
      "PENDING_REQUEST",
      "Task has a pending request",
      422,
    );
  }

  try {
    await assertMemberIds(db, input.orgId, [input.userId]);
  } catch {
    throw new MoveToSpaceError("ORG_NOT_FOUND", "Organization not found", 404);
  }

  if (input.projectId) {
    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, input.projectId),
        eq(projects.orgId, input.orgId),
        isNull(projects.deletedAt),
      ),
    });
    if (!project) {
      throw new MoveToSpaceError(
        "PROJECT_NOT_FOUND",
        "Project not found in this organization",
        422,
      );
    }
  }

  try {
    await assertNowCapForCreate(
      db,
      input.userId,
      task.scheduledDate,
      task.bucket,
      input.orgId,
    );
  } catch (error) {
    if (error instanceof NowCapExceededError) {
      throw new MoveToSpaceError("NOW_CAP_REACHED", "Now cap reached", 409);
    }
    throw error;
  }

  await db
    .update(tasks)
    .set({
      orgId: input.orgId,
      projectId: input.projectId,
      isPrivate: input.isPrivate,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId)));

  await db.insert(orgAuditLog).values({
    orgId: input.orgId,
    actorId: input.userId,
    kind: "task_moved_in",
    payload: { taskId: input.taskId, title: task.title },
  });

  await insertTimelineEvents(db, input.taskId, input.userId, [
    { type: "moved_to_space", data: { orgId: input.orgId } },
  ]);
}
