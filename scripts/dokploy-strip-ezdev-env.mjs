/**
 * Remove *.ezdev.net from Dokploy compose env and set rraj.dev API URLs.
 * Usage: node scripts/dokploy-strip-ezdev-env.mjs [prodComposeId] [stagingComposeId]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prodComposeId = process.argv[2] ?? "xHlWJkHiQM3I84MDAjXh5";
const stagingComposeId = process.argv[3] ?? "J4Cc9caZSGkC5TQPE88gy";

const mcpPath = path.join(process.env.HOME ?? "", ".cursor/mcp.json");
const mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
const srv = mcp.mcpServers["personal-dokploy-mcp"];
if (!srv?.env?.DOKPLOY_API_KEY) {
  throw new Error("personal-dokploy-mcp not configured in ~/.cursor/mcp.json");
}
const apiUrl = srv.env.DOKPLOY_URL.replace(/\/$/, "");
const apiKey = srv.env.DOKPLOY_API_KEY;

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function serializeEnv(map) {
  return [...map.entries()]
    .map(([key, value]) => {
      if (/[\s#"']/.test(value)) {
        return `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return `${key}=${value}`;
    })
    .join("\n");
}

const URL_REPLACEMENTS = [
  ["https://api.staging.tudu.ezdev.net", "https://api.staging.tudu.rraj.dev"],
  ["https://api.tudu.ezdev.net", "https://api.tudu.rraj.dev"],
  ["https://staging.tudu.ezdev.net", "https://staging.tudu.rraj.dev"],
  ["https://tudu.ezdev.net", "https://tudu.rraj.dev"],
  ["http://api.staging.tudu.ezdev.net", "https://api.staging.tudu.rraj.dev"],
  ["http://api.tudu.ezdev.net", "https://api.tudu.rraj.dev"],
];

function stripEzdevFromValue(value) {
  let v = value;
  for (const [from, to] of URL_REPLACEMENTS) {
    v = v.split(from).join(to);
  }
  return v;
}

function applyProdDefaults(env) {
  env.set("BETTER_AUTH_URL", "https://api.tudu.rraj.dev");
  env.set("VITE_API_URL", "https://api.tudu.rraj.dev");
  env.set("UPDATES_PUBLIC_BASE_URL", "https://api.tudu.rraj.dev");
  const cors = new Set(
    stripEzdevFromValue(env.get("CORS_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("ezdev.net")),
  );
  cors.add("https://tudu.rraj.dev");
  cors.add("tauri://localhost");
  env.set("CORS_ORIGINS", [...cors].join(","));
}

function applyStagingDefaults(env) {
  env.set("BETTER_AUTH_URL", "https://api.staging.tudu.rraj.dev");
  env.set("VITE_API_URL", "https://api.staging.tudu.rraj.dev");
  env.set("UPDATES_PUBLIC_BASE_URL", "https://api.staging.tudu.rraj.dev");
  const cors = new Set(
    stripEzdevFromValue(env.get("CORS_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("ezdev.net")),
  );
  cors.add("https://staging.tudu.rraj.dev");
  cors.add("tauri://localhost");
  env.set("CORS_ORIGINS", [...cors].join(","));
}

function scrubEnv(env) {
  for (const [key, value] of env) {
    env.set(key, stripEzdevFromValue(value));
  }
  if (env.has("CORS_ORIGINS")) {
    env.set(
      "CORS_ORIGINS",
      env
        .get("CORS_ORIGINS")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.includes("ezdev.net"))
        .join(","),
    );
  }
}

async function composeOne(composeId) {
  const res = await fetch(
    `${apiUrl}/api/compose.one?composeId=${encodeURIComponent(composeId)}`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!res.ok) {
    throw new Error(`compose.one ${composeId} failed: ${res.status}`);
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

async function saveEnvironment(composeId, envText) {
  const res = await fetch(`${apiUrl}/api/compose.saveEnvironment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      composeId,
      env: envText,
      createEnvFile: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`compose.saveEnvironment failed: ${res.status} ${body}`);
  }
}

async function deploy(composeId, title) {
  const res = await fetch(`${apiUrl}/api/compose.deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      composeId,
      title,
      description: "Strip ezdev.net URLs; use rraj.dev only",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`compose.deploy failed: ${res.status} ${body}`);
  }
}

async function updateCompose(composeId, mode) {
  const raw = await composeOne(composeId);
  const env = parseEnv(raw);
  scrubEnv(env);
  if (mode === "prod") {
    applyProdDefaults(env);
  } else {
    applyStagingDefaults(env);
  }
  const out = serializeEnv(env);
  await saveEnvironment(composeId, out);
  await deploy(composeId, `Env: rraj.dev only (${mode})`);
  console.log(`Updated and redeployed ${mode} compose ${composeId}`);
}

await updateCompose(prodComposeId, "prod");
await updateCompose(stagingComposeId, "staging");
