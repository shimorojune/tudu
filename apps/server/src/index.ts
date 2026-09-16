import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { serve } from "@hono/node-server";
import { createDb } from "@tudu/db";
import {
  DEFAULT_SERVER_PORT,
  type HealthResponse,
  type MeResponse,
} from "@tudu/shared";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { createAuth } from "./auth.js";
import { createActivityRoute } from "./routes/activity.js";
import { createJiraRoute } from "./routes/jira.js";
import { createLinkPreviewRoute } from "./routes/linkPreview.js";
import { createManagerRoute } from "./routes/manager.js";
import { createTaskAttachmentsRoute } from "./routes/taskAttachments.js";
import { createTasksRoute } from "./routes/tasks.js";
import { createUpdatesRoute } from "./routes/updates.js";
import { createSessionMiddleware, type SessionEnv } from "./session-middleware.js";
import { createSyncRoute } from "./routes/sync.js";

const serverDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(serverDir, "../../../.env") });

const app = new Hono<SessionEnv>();

const DEV_ORIGINS = [
  "http://localhost:1420",
  "http://localhost:5173",
  "tauri://localhost",
];

function resolveCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEV_ORIGINS;
}

app.use(
  "*",
  cors({
    origin: resolveCorsOrigins(),
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl ? createDb(databaseUrl) : null;
const trustedOrigins = resolveCorsOrigins();
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
  app.route("/", createSyncRoute(db));
  app.route("/", createJiraRoute(db));
  app.route("/", createManagerRoute(db));
  app.route("/", createTasksRoute(db));
  app.route("/", createTaskAttachmentsRoute(db));
  app.route("/", createActivityRoute(db));
  app.route("/", createLinkPreviewRoute());
}

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port}`);
  },
);
