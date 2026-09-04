import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { serve } from "@hono/node-server";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { createDb, findActiveUser, upsertUser } from "@tudu/db";
import {
  DEFAULT_SERVER_PORT,
  type HealthResponse,
  type MeResponse,
} from "@tudu/shared";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { createClerkWebhookRoute } from "./routes/clerk-webhook.js";

const serverDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(serverDir, "../../../.env") });

const app = new Hono();

const DEV_ORIGINS = ["http://localhost:1420", "http://localhost:5173"];

app.use(
  "*",
  cors({
    origin: DEV_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl ? createDb(databaseUrl) : null;

app.route("/", createClerkWebhookRoute(db));

app.use("*", clerkMiddleware());

const allowJitProvisioning = process.env.ALLOW_JIT_PROVISIONING === "true";

app.get("/health", (c) => {
  const response: HealthResponse = {
    status: "ok",
    version: process.env.npm_package_version ?? "0.0.1",
  };
  return c.json(response);
});

app.get("/me", async (c) => {
  const auth = getAuth(c);

  if (!auth?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!db) {
    return c.json({ error: "Database not configured" }, 503);
  }

  let user = await findActiveUser(db, auth.userId);

  if (!user) {
    if (!allowJitProvisioning) {
      return c.json({ error: "User not provisioned" }, 404);
    }

    const email =
      (auth.sessionClaims?.email as string | undefined) ??
      `${auth.userId}@users.clerk`;

    user = await upsertUser(db, {
      clerkUserId: auth.userId,
      email,
    });
  }

  const response: MeResponse = {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };

  return c.json(response);
});

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
