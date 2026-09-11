import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  createDb,
  createTask,
  ensureProjectForUser,
  inboxItems,
  managerLinks,
  managerPermissions,
  tasks,
  user,
} from "@tudu/db";
import { DEFAULT_MANAGER_PERMISSIONS, effectiveDayIso } from "@tudu/shared";
import { and, eq, isNull } from "drizzle-orm";
import { createAuth } from "../src/auth.js";

const TEST_PASSWORD = "egain@123";

const ACCOUNTS = [
  { email: "testuser@egain.com", name: "Test User" },
  { email: "marcus@egain.com", name: "Marcus Bell" },
  { email: "priya@egain.com", name: "Priya Raman" },
] as const;

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, "../../../.env") });

function resolveTrustedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length
    ? configured
    : [
        "http://localhost:1420",
        "http://localhost:5173",
        "tauri://localhost",
      ];
}

function offsetIso(from: string, days: number): string {
  const date = new Date(`${from}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function ensureUser(
  auth: ReturnType<typeof createAuth>,
  db: ReturnType<typeof createDb>,
  email: string,
  name: string,
): Promise<string> {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  try {
    await auth.api.signUpEmail({
      body: { email, password: TEST_PASSWORD, name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already exists")) {
      throw error;
    }
  }

  const created = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!created[0]) {
    throw new Error(`Failed to seed ${email}`);
  }

  return created[0].id;
}

async function ensureLink(
  db: ReturnType<typeof createDb>,
  managerUserId: string,
  reportUserId: string,
) {
  const existing = await db.query.managerLinks.findFirst({
    where: and(
      eq(managerLinks.managerUserId, managerUserId),
      eq(managerLinks.reportUserId, reportUserId),
      isNull(managerLinks.deletedAt),
    ),
  });

  if (existing) {
    return existing.id;
  }

  const [link] = await db
    .insert(managerLinks)
    .values({ managerUserId, reportUserId })
    .returning();

  await db.insert(managerPermissions).values({
    managerLinkId: link!.id,
    ...DEFAULT_MANAGER_PERMISSIONS,
  });

  return link!.id;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed test users in production");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  const auth = createAuth(db, resolveTrustedOrigins());

  const ids: Record<string, string> = {};
  for (const account of ACCOUNTS) {
    ids[account.email] = await ensureUser(auth, db, account.email, account.name);
    console.log(`Seeded ${account.email}`);
  }

  const testuserId = ids["testuser@egain.com"]!;
  const marcusId = ids["marcus@egain.com"]!;
  const priyaId = ids["priya@egain.com"]!;

  await ensureLink(db, marcusId, testuserId);
  await ensureLink(db, testuserId, priyaId);

  const egs = await ensureProjectForUser(db, testuserId, {
    name: "EGS",
    color: "ember",
  });
  const home = await ensureProjectForUser(db, testuserId, {
    name: "Home",
    color: "moss",
  });
  await ensureProjectForUser(db, marcusId, { name: "EGS", color: "ember" });

  const today = effectiveDayIso();
  const tomorrow = offsetIso(today, 1);

  const pendingFromMarcus = await db.query.inboxItems.findFirst({
    where: and(
      eq(inboxItems.fromUserId, marcusId),
      eq(inboxItems.toUserId, testuserId),
      eq(inboxItems.status, "pending"),
      isNull(inboxItems.deletedAt),
    ),
  });

  if (!pendingFromMarcus) {
    const first = await createTask(db, {
      userId: testuserId,
      title: "Write up capacity risks for Q4 planning",
      scheduledDate: null,
      bucket: null,
      startDate: tomorrow,
      deadline: new Date(`${offsetIso(today, 3)}T18:00:00.000Z`),
      isPrivate: false,
    });
    await db.insert(inboxItems).values({
      taskId: first.id,
      fromUserId: marcusId,
      toUserId: testuserId,
      status: "pending",
    });

    const second = await createTask(db, {
      userId: testuserId,
      title: "Take over the archive migration dry run",
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: null,
      isPrivate: false,
    });
    await db.insert(inboxItems).values({
      taskId: second.id,
      fromUserId: marcusId,
      toUserId: testuserId,
      status: "pending",
    });

    const accepted = await createTask(db, {
      userId: testuserId,
      title: "Review Priya's version-comparison patch",
      scheduledDate: today,
      bucket: "next",
      startDate: null,
      deadline: null,
      isPrivate: false,
    });
    await db.insert(inboxItems).values({
      taskId: accepted.id,
      fromUserId: marcusId,
      toUserId: testuserId,
      status: "accepted",
    });
  }

  const bounced = await db.query.inboxItems.findFirst({
    where: and(
      eq(inboxItems.fromUserId, testuserId),
      eq(inboxItems.toUserId, marcusId),
      eq(inboxItems.status, "pending"),
      isNull(inboxItems.deletedAt),
    ),
  });

  if (!bounced) {
    const returned = await createTask(db, {
      userId: marcusId,
      title: "Pair with Jun on migration dry run",
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: null,
      isPrivate: false,
    });
    await db.insert(inboxItems).values({
      taskId: returned.id,
      fromUserId: testuserId,
      toUserId: marcusId,
      status: "pending",
      declineReason: "Wednesday is the release cut. Can this move to next week?",
    });
  }

  const privateTask = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.userId, testuserId),
      eq(tasks.isPrivate, true),
      isNull(tasks.deletedAt),
    ),
  });

  if (!privateTask) {
    await createTask(db, {
      userId: testuserId,
      title: "Private: draft notes for 1:1",
      scheduledDate: today,
      bucket: "later",
      startDate: null,
      deadline: null,
      isPrivate: true,
    });
  }

  const seededProjectTask = await db.query.tasks.findFirst({
    where: and(
      eq(tasks.userId, testuserId),
      eq(tasks.projectId, egs.id),
      isNull(tasks.deletedAt),
    ),
  });

  if (!seededProjectTask) {
    await createTask(db, {
      userId: testuserId,
      title: "Ship EGS capacity notes",
      scheduledDate: today,
      bucket: "now",
      startDate: null,
      deadline: null,
      isPrivate: false,
      projectId: egs.id,
    });
    await createTask(db, {
      userId: testuserId,
      title: "Book dentist",
      scheduledDate: tomorrow,
      bucket: "later",
      startDate: null,
      deadline: null,
      isPrivate: false,
      projectId: home.id,
    });
    await createTask(db, {
      userId: testuserId,
      title: "Sort garage bins",
      scheduledDate: null,
      bucket: null,
      startDate: null,
      deadline: null,
      isPrivate: false,
      projectId: home.id,
    });
  }

  const priyaExisting = await db.query.tasks.findFirst({
    where: and(eq(tasks.userId, priyaId), isNull(tasks.deletedAt)),
  });

  if (!priyaExisting) {
    await createTask(db, {
      userId: priyaId,
      title: "Incorrect article version comparison",
      scheduledDate: today,
      bucket: "now",
      startDate: null,
      deadline: new Date(`${today}T18:00:00.000Z`),
      isPrivate: false,
    });
    await createTask(db, {
      userId: priyaId,
      title: "Archive permissions doc",
      scheduledDate: today,
      bucket: "now",
      startDate: null,
      deadline: null,
      isPrivate: false,
    });
    const priyaEgs = await ensureProjectForUser(db, priyaId, {
      name: "EGS",
      color: "ember",
    });
    const slipping = await createTask(db, {
      userId: priyaId,
      title: "Triage EGS inbox",
      scheduledDate: today,
      bucket: "next",
      startDate: null,
      deadline: null,
      isPrivate: false,
      projectId: priyaEgs.id,
    });
    await db
      .update(tasks)
      .set({ carriedDays: 2, carriedSince: offsetIso(today, -2) })
      .where(eq(tasks.id, slipping.id));

    await createTask(db, {
      userId: priyaId,
      title: "Write up version-compare test plan",
      scheduledDate: today,
      bucket: "later",
      startDate: null,
      deadline: null,
      isPrivate: false,
    });
  }

  console.log("Manager graph ready: Marcus manages testuser, testuser manages Priya");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
