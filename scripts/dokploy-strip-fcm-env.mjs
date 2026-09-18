import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const composeId = process.argv[2] ?? "xHlWJkHiQM3I84MDAjXh5";
const mcp = JSON.parse(
  await readFile(path.join(process.env.HOME ?? "", ".cursor/mcp.json"), "utf8"),
);
const apiUrl = mcp.mcpServers["personal-dokploy-mcp"].env.DOKPLOY_URL.replace(
  /\/$/,
  "",
);
const apiKey = mcp.mcpServers["personal-dokploy-mcp"].env.DOKPLOY_API_KEY;

const oneRes = await fetch(
  `${apiUrl}/api/compose.one?composeId=${encodeURIComponent(composeId)}`,
  { headers: { "x-api-key": apiKey } },
);
const oneJson = await oneRes.json();
const currentEnv =
  typeof oneJson.env === "string" ? oneJson.env : oneJson.data?.env ?? "";

const stripKeys = new Set([
  "FCM_SERVICE_ACCOUNT_JSON",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_VAPID_KEY",
]);

const lines = currentEnv
  .split("\n")
  .filter((line) => {
    const key = line.split("=")[0]?.trim();
    return key && !stripKeys.has(key);
  });

const envText = lines.join("\n");

await fetch(`${apiUrl}/api/compose.saveEnvironment`, {
  method: "POST",
  headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({ composeId, env: envText, createEnvFile: true }),
});

await fetch(`${apiUrl}/api/compose.deploy`, {
  method: "POST",
  headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
  body: JSON.stringify({
    composeId,
    title: "Restore API: strip FCM env",
    description: "Server crash loop; remove FCM until fixed image ships",
  }),
});

console.log("Stripped Firebase env vars and triggered redeploy.");
