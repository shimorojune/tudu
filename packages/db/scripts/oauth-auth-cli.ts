import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import * as schema from "../src/schema.js";

export const auth = betterAuth({
  secret: "dev-cli-secret-must-be-32-chars-min",
  baseURL: "http://localhost:3000",
  database: drizzleAdapter({} as never, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      scopes: [
        "openid",
        "profile",
        "email",
        "offline_access",
        "tasks:read",
        "tasks:write",
      ],
      allowDynamicClientRegistration: true,
    }),
  ],
});
