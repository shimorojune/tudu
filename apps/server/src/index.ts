import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { serve } from "@hono/node-server";
import { createApp, resolveServerPort } from "./app.js";
import { shutdownAnalytics } from "./analytics/posthog.js";

const serverDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(serverDir, "../../../.env") });

const { app } = createApp({ startNotificationScheduler: true });

const port = resolveServerPort();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server listening on http://localhost:${info.port}`);
  },
);

function registerShutdown() {
  const flush = () => {
    void shutdownAnalytics();
  };
  process.on("SIGINT", flush);
  process.on("SIGTERM", flush);
  process.on("beforeExit", flush);
}

registerShutdown();
