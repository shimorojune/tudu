import type { Db } from "@tudu/db";
import { createMiddleware } from "hono/factory";
import { Hono } from "hono";
import type { SessionEnv } from "../session-middleware.js";

export type HarnessUser = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

export function createSessionTestApp(
  register: (app: Hono<SessionEnv>, db: Db) => void,
  db: Db,
  user: HarnessUser | null,
) {
  const app = new Hono<SessionEnv>();

  app.use(
    "*",
    createMiddleware<SessionEnv>(async (c, next) => {
      if (user) {
        c.set("session", {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt,
            emailVerified: true,
            image: null,
            updatedAt: user.createdAt,
          },
          session: {
            id: "test-session",
            userId: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
            token: "test-token",
            createdAt: new Date(),
            updatedAt: new Date(),
            ipAddress: null,
            userAgent: null,
          },
        });
      } else {
        c.set("session", null);
      }
      await next();
    }),
  );

  register(app, db);
  return app;
}
