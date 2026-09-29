import { and, asc, eq, isNull } from "drizzle-orm";
import type {
  CoworkerDayResponse,
  CoworkerDayTask,
  CoworkerRosterEntry,
} from "@tudu/shared";
import { formatTaskKey, isSlipping } from "@tudu/shared";
import { AccessError, requireMember } from "./access.js";
import type { Db } from "./index.js";
import { getUserLastSeen } from "./userActivity.js";
import { orgMembers } from "./orgs-schema.js";
import { tasks } from "./tasks-schema.js";
import { notPendingRequest } from "./tasks.js";
import { OrgActionError } from "./orgs.js";

function rethrowAccess(error: unknown): never {
  if (error instanceof AccessError) {
    throw new OrgActionError(error.code, error.message, 404);
  }
  throw error;
}

export async function listCoworkerRoster(
  db: Db,
  viewerId: string,
  orgSlug: string,
  scheduledDate: string,
  now: Date = new Date(),
): Promise<{ orgName: string; members: CoworkerRosterEntry[] }> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, viewerId, orgSlug);
  } catch (error) {
    rethrowAccess(error);
  }

  const memberRows = await db.query.orgMembers.findMany({
    where: and(eq(orgMembers.orgId, live.org.id), isNull(orgMembers.leftAt)),
    with: { user: true },
    orderBy: [asc(orgMembers.joinedAt)],
  });

  const entries: CoworkerRosterEntry[] = [];

  for (const row of memberRows) {
    const memberId = row.userId;
    const orgTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.userId, memberId),
        eq(tasks.orgId, live.org.id),
        isNull(tasks.deletedAt),
        notPendingRequest(),
        eq(tasks.scheduledDate, scheduledDate),
      ),
      columns: {
        id: true,
        title: true,
        bucket: true,
        completedAt: true,
        carriedDays: true,
        deadline: true,
        isPrivate: true,
      },
      orderBy: [tasks.bucket, tasks.position],
    });

    const visible =
      memberId === viewerId
        ? orgTasks
        : orgTasks.filter((task) => !task.isPrivate);

    const open = visible.filter((task) => task.completedAt === null);
    const nowTasks = open.filter((task) => task.bucket === "now");
    const slipping = open.filter((task) =>
      isSlipping({
        carriedDays: task.carriedDays,
        deadline: task.deadline?.toISOString() ?? null,
        now,
      }),
    );

    const lastSeenAt = await getUserLastSeen(db, memberId);

    entries.push({
      userId: memberId,
      name: row.user.name,
      email: row.user.email,
      isSelf: memberId === viewerId,
      nowCount: nowTasks.length,
      openCount: open.length,
      slippingCount: slipping.length,
      nowTitle: nowTasks[0]?.title ?? null,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    });
  }

  const selfIndex = entries.findIndex((entry) => entry.isSelf);
  if (selfIndex > 0) {
    const [self] = entries.splice(selfIndex, 1);
    entries.unshift(self);
  }

  return { orgName: live.org.name, members: entries };
}

export type CoworkerDaySummary = Omit<CoworkerDayResponse, "tasks">;

function serializeCoworkerDayTask(
  row: {
    id: string;
    title: string;
    bucket: "now" | "next" | "later" | null;
    position: number;
    completedAt: Date | null;
    deadline: Date | null;
    carriedDays: number;
    taskNumber: number;
  },
  keyPrefix: string,
): CoworkerDayTask {
  return {
    id: row.id,
    title: row.title,
    bucket: row.bucket,
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    deadline: row.deadline?.toISOString() ?? null,
    carriedDays: row.carriedDays,
    taskNumber: row.taskNumber,
    taskKey: formatTaskKey(keyPrefix, row.taskNumber),
  };
}

export async function getCoworkerDay(
  db: Db,
  viewerId: string,
  orgSlug: string,
  coworkerUserId: string,
  scheduledDate: string,
): Promise<CoworkerDayResponse> {
  let live: Awaited<ReturnType<typeof requireMember>>;
  try {
    live = await requireMember(db, viewerId, orgSlug);
  } catch (error) {
    rethrowAccess(error);
  }

  const targetMember = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, live.org.id),
      eq(orgMembers.userId, coworkerUserId),
      isNull(orgMembers.leftAt),
    ),
    with: { user: true },
  });
  if (!targetMember) {
    throw new OrgActionError("ORG_NOT_FOUND", "Not found", 404);
  }

  const allTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.userId, coworkerUserId),
      eq(tasks.orgId, live.org.id),
      isNull(tasks.deletedAt),
      notPendingRequest(),
      eq(tasks.scheduledDate, scheduledDate),
    ),
    columns: {
      id: true,
      title: true,
      bucket: true,
      position: true,
      completedAt: true,
      deadline: true,
      carriedDays: true,
      isPrivate: true,
      taskNumber: true,
    },
    orderBy: [tasks.bucket, tasks.position],
  });

  const privateCount =
    coworkerUserId === viewerId
      ? 0
      : allTasks.filter((task) => task.isPrivate).length;

  const visible =
    coworkerUserId === viewerId
      ? allTasks
      : allTasks.filter((task) => !task.isPrivate);

  const nowOpen = visible.filter(
    (task) => task.bucket === "now" && task.completedAt === null,
  ).length;

  return {
    orgName: live.org.name,
    userId: coworkerUserId,
    userName: targetMember.user.name,
    scheduledDate,
    privateHiddenCount: privateCount,
    nowCount: nowOpen,
    nowCap: 5,
    tasks: visible.map((task) =>
      serializeCoworkerDayTask(task, live.org.keyPrefix),
    ),
  };
}

/** @deprecated Use getCoworkerDay */
export async function getCoworkerDaySummary(
  db: Db,
  viewerId: string,
  orgSlug: string,
  coworkerUserId: string,
  scheduledDate: string,
): Promise<CoworkerDaySummary> {
  const day = await getCoworkerDay(
    db,
    viewerId,
    orgSlug,
    coworkerUserId,
    scheduledDate,
  );
  const { tasks: _tasks, ...summary } = day;
  return summary;
}
