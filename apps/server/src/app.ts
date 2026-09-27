import { createDb, ensureSystemUser, type Db } from "@tudu/db";
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
import { createManagerRoute } from "./routes/manager.js";
import { createPushRoute } from "./routes/push.js";
import { createQuickAddSuggestRoute } from "./routes/quickAddSuggest.js";
import { createSettingsRoute } from "./routes/settings.js";
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

  app.get("/me", async (c) => {
    const session = c.get("session");

    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const response: MeResponse = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      createdAt: new Date(session.user.createdAt).toISOString(),
    };

    return c.json(response);
  });

  if (db) {
    void ensureSystemUser(db).catch((error) => {
      console.error("[startup] system user", error);
    });
    app.route("/", createSyncRoute(db));
    app.route("/", createJiraRoute(db));
    app.route("/", createManagerRoute(db));
    app.route("/", createTasksRoute(db));
    app.route("/", createTaskAttachmentsRoute(db));
    app.route("/", createActivityRoute(db));
    app.route("/", createLinkPreviewRoute());
    app.route("/", createQuickAddSuggestRoute(db));
    app.route("/", createPushRoute(db));
    app.route("/", createSettingsRoute(db));

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
