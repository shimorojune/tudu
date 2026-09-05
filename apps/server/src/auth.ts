import type { Db } from "@tudu/db";
import * as schema from "@tudu/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

export function createAuth(db: Db, trustedOrigins: string[]) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;

  if (!secret) {
    throw new Error("Missing BETTER_AUTH_SECRET");
  }

  if (!baseURL) {
    throw new Error("Missing BETTER_AUTH_URL");
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [bearer()],
    secret,
    baseURL,
    trustedOrigins,
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
