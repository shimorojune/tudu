import { createDb, ensureSystemUser, user, type Db } from "@tudu/db";
import { eq } from "drizzle-orm";
import {
  DEFAULT_SERVER_PORT,
  type HealthResponse,
  type MeResponse,
} from "@tudu/shared";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { createAuth, type Auth } from "./auth.js";
import { startNotificationScheduler } from "./jobs/notificationScheduler.js";
import { createActivityRoute } from "./routes/activity.js";
import { createJiraRoute } from "./routes/jira.js";
import { createLinkPreviewRoute } from "./routes/linkPreview.js";
import { createPushRoute } from "./routes/push.js";
import { createQuickAddSuggestRoute } from "./routes/quickAddSuggest.js";
import { createSettingsRoute } from "./routes/settings.js";
import { createOrgsRoute } from "./routes/orgs.js";
import { createInvitesRoute } from "./routes/invites.js";
import { createJoinRoute } from "./routes/join.js";
import {
  assertSafeTestRoutes,
  createTestOutboxRoute,
} from "./routes/testOutbox.js";
import { createSyncRoute } from "./routes/sync.js";
import { createTaskAttachmentsRoute } from "./routes/taskAttachments.js";
import { createTasksRoute } from "./routes/tasks.js";
import { createUpdatesRoute } from "./routes/updates.js";
import {
  createSessionMiddleware,
  type SessionEnv,
} from "./session-middleware.js";

const DEV_ORIGINS = [
  "http://localhost:1420",
  "http://localhost:5173",
  "http://localhost:5174",
  "tauri://localhost",
];

export function resolveCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEV_ORIGINS;
}

export type CreateAppOptions = {
  databaseUrl?: string | null;
  startNotificationScheduler?: boolean;
};

export type TuduApp = {
  app: Hono<SessionEnv>;
  db: Db | null;
  auth: Auth | null;
};

export function createApp(options: CreateAppOptions = {}): TuduApp {
  assertSafeTestRoutes();

  const databaseUrl =
    options.databaseUrl === undefined
      ? process.env.DATABASE_URL
      : options.databaseUrl;

  const app = new Hono<SessionEnv>();
  const trustedOrigins = resolveCorsOrigins();

  app.use(
    "*",
    cors({
      origin: trustedOrigins,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["set-auth-token"],
      credentials: true,
    }),
  );

  const db = databaseUrl ? createDb(databaseUrl) : null;
  const auth = db ? createAuth(db, trustedOrigins) : null;

  app.get("/health", (c) => {
    const response: HealthResponse = {
      status: "ok",
      version: process.env.npm_package_version ?? "0.0.1",
    };
    return c.json(response);
  });

  app.route("/", createUpdatesRoute());

  app.all("/api/auth/*", (c) => {
    if (!auth) {
      return c.json({ error: "Database not configured" }, 503);
    }

    return auth.handler(c.req.raw);
  });

  if (auth) {
    app.use("*", createSessionMiddleware(auth));
  }

  async function meResponseForUser(userId: string): Promise<MeResponse | null> {
    if (!db) {
      return null;
    }
    const row = await db.query.user.findFirst({
      where: eq(user.id, userId),
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      onboardedAt: row.onboardedAt?.toISOString() ?? null,
    };
  }

  app.get("/me", async (c) => {
    const session = c.get("session");

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const response = await meResponseForUser(session.user.id);
    if (!response) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(response);
  });

  app.patch("/me", async (c) => {
    const session = c.get("session");

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!db) {
      return c.json({ error: "Database not configured" }, 503);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      completeOnboarding?: boolean;
    };
    if (body.completeOnboarding) {
      await db
        .update(user)
        .set({ onboardedAt: new Date() })
        .where(eq(user.id, session.user.id));
    }

    const response = await meResponseForUser(session.user.id);
    if (!response) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(response);
  });

  if (db) {
    void ensureSystemUser(db).catch((error) => {
      console.error("[startup] system user", error);
    });
    app.route("/", createSyncRoute(db));
    app.route("/", createJiraRoute(db));
    app.route("/", createTasksRoute(db));
    app.route("/", createTaskAttachmentsRoute(db));
    app.route("/", createActivityRoute(db));
    app.route("/", createLinkPreviewRoute());
    app.route("/", createQuickAddSuggestRoute(db));
    app.route("/", createPushRoute(db));
    app.route("/", createSettingsRoute(db));
    app.route("/orgs", createOrgsRoute(db));
    app.route("/", createInvitesRoute(db));
    app.route("/", createJoinRoute(db));
    if (process.env.E2E_TEST_ROUTES === "1") {
      app.route("/", createTestOutboxRoute());
    }

    if (options.startNotificationScheduler !== false) {
      const jobsEnabled = process.env.NOTIFICATION_JOBS_ENABLED !== "false";
      if (jobsEnabled) {
        startNotificationScheduler(db);
      }
    }
  }

  return { app, db, auth };
}

export function resolveServerPort(): number {
  return Number(process.env.PORT) || DEFAULT_SERVER_PORT;
}
