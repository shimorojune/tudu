import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import type { Hono } from "hono";
import type { Auth } from "./auth.js";
import type { SessionEnv } from "./session-middleware.js";

export function mountOAuthAuthorizationServerMetadata(
  app: Hono<SessionEnv>,
  auth: Auth,
) {
  const handler = oauthProviderAuthServerMetadata(auth);
  app.get("/.well-known/oauth-authorization-server", (c) => handler(c.req.raw));
}
