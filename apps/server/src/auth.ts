import type { Db } from "@tudu/db";
import * as schema from "@tudu/db/schema";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt } from "better-auth/plugins";
import {
  resolveOAuthConsentPage,
  resolveOAuthLoginPage,
  resolveTuduApiResourceIdentifier,
} from "./resolveOAuthPages.js";
import { TUDU_OAUTH_SCOPES } from "./oauthScopes.js";

export function createAuth(db: Db, trustedOrigins: string[]) {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;

  if (!secret) {
    throw new Error("Missing BETTER_AUTH_SECRET");
  }

  if (!baseURL) {
    throw new Error("Missing BETTER_AUTH_URL");
  }

  const apiResource = resolveTuduApiResourceIdentifier();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      bearer(),
      jwt(),
      oauthProvider({
        loginPage: resolveOAuthLoginPage(),
        consentPage: resolveOAuthConsentPage(),
        scopes: [
          "openid",
          "profile",
          "email",
          "offline_access",
          ...TUDU_OAUTH_SCOPES,
        ],
        allowDynamicClientRegistration: true,
        enforcePerClientResources: false,
        resources: [apiResource],
        clientRegistrationDefaultResources: [apiResource],
        clientRegistrationAllowedScopes: [...TUDU_OAUTH_SCOPES],
        clientRegistrationDefaultScopes: [...TUDU_OAUTH_SCOPES],
      }),
    ],
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
