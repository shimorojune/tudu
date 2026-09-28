import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  createDb,
  createOrg,
  createTask,
  ensureSystemUser,
  sendNewTaskRequest,
  orgMembers,
  orgs,
  updateOrg,
  user,
} from "@tudu/db";
import { effectiveDayIso } from "@tudu/shared";
import { and, eq, isNull } from "drizzle-orm";
import { createAuth } from "../src/auth.js";

const DEMO_PASSWORD = "egain@123";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, "../../../.env") });

function resolveTrustedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length
    ? configured
    : ["http://localhost:1420", "http://localhost:5173", "tauri://localhost"];
}

function assertSafeDatabaseUrl(url: string): void {
  const lower = url.toLowerCase();
  const isLocal =
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("e2e") ||
    lower.includes("dev");
  if (!isLocal) {
    throw new Error(
      "seed-orgs-demo refused: DATABASE_URL must be local, e2e, or dev",
    );
  }
}

async function ensureUser(
  auth: ReturnType<typeof createAuth>,
  db: ReturnType<typeof createDb>,
  email: string,
  name: string,
  onboardedAt?: Date | null,
): Promise<string> {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existing[0]) {
    if (onboardedAt === null) {
      await db
        .update(user)
        .set({ onboardedAt: null })
        .where(eq(user.id, existing[0].id));
    }
    return existing[0].id;
  }
  await auth.api.signUpEmail({
    body: { email, password: DEMO_PASSWORD, name },
  });
  const created = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!created[0]) {
    throw new Error(`Failed to create user ${email}`);
  }
  if (onboardedAt === null) {
    await db
      .update(user)
      .set({ onboardedAt: null })
      .where(eq(user.id, created[0].id));
  }
  return created[0].id;
}

async function ensureMember(
  db: ReturnType<typeof createDb>,
  orgId: string,
  userId: string,
  role: "owner" | "member",
) {
  const exists = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, orgId),
      eq(orgMembers.userId, userId),
      isNull(orgMembers.leftAt),
    ),
  });
  if (!exists) {
    await db.insert(orgMembers).values({ orgId, userId, role });
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  assertSafeDatabaseUrl(databaseUrl);

  const db = createDb(databaseUrl);
  const auth = createAuth(db, resolveTrustedOrigins());
  await ensureSystemUser(db);

  const anaId = await ensureUser(auth, db, "ana@egsoft.com", "Ana");
  const marcusId = await ensureUser(auth, db, "marcus@egain.com", "Marcus Bell");
  const priyaId = await ensureUser(auth, db, "priya@egain.com", "Priya Raman");
  const danaId = await ensureUser(auth, db, "dana@egain.com", "Dana Okafor");
  const junId = await ensureUser(auth, db, "jun@egain.com", "Jun Lee");
  await ensureUser(auth, db, "outsider@example.com", "Outsider Example");
  await ensureUser(auth, db, "newbie@egsoft.com", "Newbie User", null);

  let egsoft = await db.query.orgs.findFirst({
    where: eq(orgs.slug, "egsoft"),
  });
  if (!egsoft) {
    egsoft = await createOrg(db, anaId, {
      name: "EGSoft",
      color: "vermilion",
      joinLinkEnabled: true,
    });
  }
  await updateOrg(db, anaId, "egsoft", {
    allowedDomains: ["egsoft.com"],
  });
  await ensureMember(db, egsoft.id, anaId, "owner");
  await ensureMember(db, egsoft.id, marcusId, "owner");
  await ensureMember(db, egsoft.id, priyaId, "member");
  await ensureMember(db, egsoft.id, danaId, "member");
  await ensureMember(db, egsoft.id, junId, "member");

  let wednesday = await db.query.orgs.findFirst({
    where: eq(orgs.slug, "wednesday-club"),
  });
  if (!wednesday) {
    wednesday = await createOrg(db, anaId, {
      name: "Wednesday Club",
      color: "cobalt",
      joinLinkEnabled: false,
    });
  }
  await ensureMember(db, wednesday.id, anaId, "owner");
  await ensureMember(db, wednesday.id, marcusId, "member");
  await ensureMember(db, wednesday.id, priyaId, "member");

  const today = effectiveDayIso();
  const titles = [
    "Improve error message for Article Archive permission failure",
    "Draft DR runbook for eDiscovery app",
    "Personal inbox cleanup",
  ];

  for (let index = 0; index < 5; index += 1) {
    await createTask(db, {
      userId: anaId,
      title: `${titles[0]} (${index + 1})`,
      scheduledDate: today,
      bucket: "now",
      startDate: null,
      deadline: null,
      isPrivate: false,
      orgId: egsoft.id,
    });
  }

  await createTask(db, {
    userId: anaId,
    title: titles[1],
    scheduledDate: today,
    bucket: "next",
    startDate: null,
    deadline: null,
    isPrivate: false,
    orgId: egsoft.id,
  });

  await createTask(db, {
    userId: anaId,
    title: titles[2],
    scheduledDate: today,
    bucket: "later",
    startDate: null,
    deadline: null,
    isPrivate: false,
    orgId: null,
  });

  await createTask(db, {
    userId: priyaId,
    title: "Private planning notes",
    scheduledDate: today,
    bucket: "later",
    startDate: null,
    deadline: null,
    isPrivate: true,
    orgId: egsoft.id,
  });

  await sendNewTaskRequest(db, danaId, {
    orgId: egsoft.id,
    toUserId: anaId,
    title: "Review Q3 rollout checklist",
    description: "Please accept with the two suggested subtasks in mind.",
    requestId: crypto.randomUUID(),
    taskId: crypto.randomUUID(),
  });

  console.log(
    "seed-orgs-demo: ensured EGSoft, Wednesday Club, demo users, tasks, and a sample request",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
