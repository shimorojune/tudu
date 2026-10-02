#!/usr/bin/env node
/**
 * Merge KEY=value lines into a Dokploy compose .env (same logic as CI action).
 *
 * Usage:
 *   DOKPLOY_API_URL=https://admin.rraj.dev DOKPLOY_API_KEY=... \
 *     node scripts/merge-dokploy-compose-env.mjs <composeId> <<'EOF'
 *   MCP_PUBLIC_URL=https://mcp.staging.tudu.ezdev.net
 *   TUDU_API_URL=http://server:3456
 *   EOF
 */
import { readFileSync } from "node:fs";

const composeId = process.argv[2];
if (!composeId) {
  console.error("Usage: merge-dokploy-compose-env.mjs <composeId>");
  process.exit(1);
}

const apiUrl = (process.env.DOKPLOY_API_URL ?? "https://admin.rraj.dev").replace(
  /\/$/,
  "",
);
const apiKey = process.env.DOKPLOY_API_KEY;
if (!apiKey) {
  console.error("Missing DOKPLOY_API_KEY");
  process.exit(1);
}

const updates = readFileSync(0, "utf8");

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (key) map.set(key, value);
  }
  return map;
}

const oneUrl = new URL(`${apiUrl}/api/compose.one`);
oneUrl.searchParams.set("composeId", composeId);
const oneResponse = await fetch(oneUrl, {
  headers: { "x-api-key": apiKey },
});
if (!oneResponse.ok) {
  console.error("compose.one failed", oneResponse.status, await oneResponse.text());
  process.exit(1);
}
const oneJson = await oneResponse.json();
const currentEnv =
  typeof oneJson?.env === "string"
    ? oneJson.env
    : typeof oneJson?.data?.env === "string"
      ? oneJson.data.env
      : "";

const envMap = parseEnv(currentEnv);
for (const [key, value] of parseEnv(updates)) {
  envMap.set(key, value);
}

const mergedEnv = [...envMap.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${value}`)
  .join("\n");

const saveResponse = await fetch(`${apiUrl}/api/compose.saveEnvironment`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  },
  body: JSON.stringify({
    composeId,
    env: mergedEnv,
    createEnvFile: true,
  }),
});
if (!saveResponse.ok) {
  console.error(
    "compose.saveEnvironment failed",
    saveResponse.status,
    await saveResponse.text(),
  );
  process.exit(1);
}

console.log(`Updated compose env for ${composeId}`);
