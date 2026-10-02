import { customProvider } from "skybridge/server";
import { Skybridge } from "skybridge/server";
import {
  resolveApiResource,
  resolveAuthIssuer,
  resolveMcpPublicUrl,
} from "./env.js";
import { registerTuduTools } from "./registerTools.js";

export const app = new Skybridge({
  name: "tudu-mcp",
  version: "0.36.0",
  oauth: customProvider({
    issuer: resolveAuthIssuer(),
    audience: resolveApiResource(),
    baseUrl: resolveMcpPublicUrl(),
    scopes: ["tasks:read", "tasks:write", "openid", "profile", "email"],
    requiredScopes: ["tasks:read"],
  }),
  handler: (server) => registerTuduTools(server),
});

export type AppType = typeof app;
