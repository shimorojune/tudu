import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeId = process.argv[2] ?? "xHlWJkHiQM3I84MDAjXh5";

const mcpPath = path.join(process.env.HOME ?? "", ".cursor/mcp.json");
const mcp = JSON.parse(await readFile(mcpPath, "utf8"));
const apiUrl = mcp.mcpServers["personal-dokploy-mcp"].env.DOKPLOY_URL.replace(
  /\/$/,
  "",
);
const apiKey = mcp.mcpServers["personal-dokploy-mcp"].env.DOKPLOY_API_KEY;

const oneRes = await fetch(
  `${apiUrl}/api/compose.one?composeId=${encodeURIComponent(composeId)}`,
  { headers: { "x-api-key": apiKey } },
);
if (!oneRes.ok) {
  throw new Error(`compose.one failed: ${oneRes.status}`);
}
const oneJson = await oneRes.json();
const currentEnv =
  typeof oneJson.env === "string"
    ? oneJson.env
    : typeof oneJson.data?.env === "string"
      ? oneJson.data.env
      : "";

const localEnv = await readFile(path.join(repoRoot, ".env"), "utf8");
const keysToMerge = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_VAPID_KEY",
  "FCM_SERVICE_ACCOUNT_JSON",
];

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return map;
}

const merged = parseEnv(currentEnv);
const local = parseEnv(localEnv);
for (const key of keysToMerge) {
  const value = local.get(key);
  if (value) {
    merged.set(key, value);
  }
}

const envText = [...merged.entries()]
  .map(([key, value]) => `${key}=${value}`)
  .join("\n");

const saveRes = await fetch(`${apiUrl}/api/compose.saveEnvironment`, {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    composeId,
    env: envText,
    createEnvFile: true,
  }),
});
if (!saveRes.ok) {
  const body = await saveRes.text();
  throw new Error(`compose.saveEnvironment failed: ${saveRes.status} ${body}`);
}

const deployRes = await fetch(`${apiUrl}/api/compose.deploy`, {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    composeId,
    title: "Firebase web push env",
    description: "Add FCM_SERVICE_ACCOUNT_JSON and VITE_FIREBASE_* for PWA push",
  }),
});
if (!deployRes.ok) {
  const body = await deployRes.text();
  throw new Error(`compose.deploy failed: ${deployRes.status} ${body}`);
}

console.log("Merged Firebase env keys and triggered compose.deploy.");
