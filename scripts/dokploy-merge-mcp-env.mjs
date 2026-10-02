/**
 * Merge MCP-related env into prod and staging Dokploy compose stacks, then redeploy.
 * Usage: node scripts/dokploy-merge-mcp-env.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const prodComposeId = "xHlWJkHiQM3I84MDAjXh5";
const stagingComposeId = "J4Cc9caZSGkC5TQPE88gy";

const mcpPath = path.join(process.env.HOME ?? "", ".cursor/mcp.json");
const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
const srv = mcp.mcpServers["personal-dokploy-mcp"];
if (!srv?.env?.DOKPLOY_API_KEY) {
  throw new Error("personal-dokploy-mcp not configured in ~/.cursor/mcp.json");
}
const apiUrl = srv.env.DOKPLOY_URL.replace(/\/$/, "");
const apiKey = srv.env.DOKPLOY_API_KEY;

const headers = {
  "Content-Type": "application/json",
  "x-api-key": apiKey,
};

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    map.set(key, value);
  }
  return map;
}

function serializeEnv(map) {
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function fetchComposeEnv(composeId) {
  const res = await fetch(
    `${apiUrl}/api/compose.one?composeId=${encodeURIComponent(composeId)}`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!res.ok) {
    throw new Error(`compose.one ${composeId}: ${res.status}`);
  }
  const json = await res.json();
  const envText =
    typeof json.env === "string"
      ? json.env
      : typeof json.data?.env === "string"
        ? json.data.env
        : "";
  return envText;
}

async function saveEnv(composeId, envText) {
  const res = await fetch(`${apiUrl}/api/compose.saveEnvironment`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      composeId,
      env: envText,
      createEnvFile: true,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `compose.saveEnvironment ${composeId}: ${res.status} ${await res.text()}`,
    );
  }
}

async function deploy(composeId, title) {
  const res = await fetch(`${apiUrl}/api/compose.deploy`, {
    method: "POST",
    headers,
    body: JSON.stringify({ composeId, title, description: "MCP service" }),
  });
  if (!res.ok) {
    throw new Error(`compose.deploy ${composeId}: ${res.status} ${await res.text()}`);
  }
}

const stacks = [
  {
    composeId: stagingComposeId,
    name: "staging",
    patch: {
      TUDU_API_URL: "http://server:3456",
      BETTER_AUTH_URL: "https://api.staging.tudu.ezdev.net",
      MCP_PUBLIC_URL: "https://mcp.staging.tudu.ezdev.net",
      TUDU_API_RESOURCE_URL: "https://api.staging.tudu.ezdev.net",
      PORT: "3100",
    },
  },
  {
    composeId: prodComposeId,
    name: "prod",
    patch: {
      TUDU_API_URL: "http://server:3456",
      BETTER_AUTH_URL: "https://api.tudu.ezdev.net",
      MCP_PUBLIC_URL: "https://mcp.tudu.ezdev.net",
      TUDU_API_RESOURCE_URL: "https://api.tudu.ezdev.net",
      PORT: "3100",
    },
  },
];

for (const stack of stacks) {
  const map = parseEnv(await fetchComposeEnv(stack.composeId));
  for (const [key, value] of Object.entries(stack.patch)) {
    map.set(key, value);
  }
  if (!map.get("TUDU_MCP_IMAGE")) {
    const serverImage = map.get("TUDU_SERVER_IMAGE");
    if (serverImage) {
      map.set(
        "TUDU_MCP_IMAGE",
        serverImage.replace("/tudu-server:", "/tudu-mcp:"),
      );
      console.warn(
        `${stack.name}: TUDU_MCP_IMAGE not set; using placeholder from server image tag until CI pushes tudu-mcp`,
      );
    }
  }
  await saveEnv(stack.composeId, serializeEnv(map));
  console.log(`Saved MCP env for ${stack.name}`);
  await deploy(stack.composeId, `MCP deploy (${stack.name})`);
  console.log(`Triggered deploy for ${stack.name}`);
}
