/**
 * Point prod + staging Dokploy at ezdev.net (env, domains, redeploy).
 * Usage: node scripts/dokploy-switch-ezdev.mjs
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

async function apiGet(pathname) {
  const res = await fetch(`${apiUrl}${pathname}`, { headers: { "x-api-key": apiKey } });
  if (!res.ok) {
    throw new Error(`${pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function apiPost(pathname, body) {
  const res = await fetch(`${apiUrl}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${pathname} failed: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}

async function composeEnv(composeId) {
  const json = await apiGet(`/api/compose.one?composeId=${encodeURIComponent(composeId)}`);
  const envText =
    typeof json.env === "string"
      ? json.env
      : typeof json.data?.env === "string"
        ? json.data.env
        : "";
  return envText;
}

function applyProdEnv(env) {
  env.set("BETTER_AUTH_URL", "https://api.tudu.ezdev.net");
  env.set("VITE_API_URL", "https://api.tudu.ezdev.net");
  env.set("UPDATES_PUBLIC_BASE_URL", "https://api.tudu.ezdev.net");
  env.set(
    "CORS_ORIGINS",
    "https://tudu.rraj.dev,https://tudu.ezdev.net,tauri://localhost",
  );
}

function applyStagingEnv(env) {
  env.set("BETTER_AUTH_URL", "https://api.staging.tudu.ezdev.net");
  env.set("VITE_API_URL", "https://api.staging.tudu.ezdev.net");
  env.set("UPDATES_PUBLIC_BASE_URL", "https://api.staging.tudu.ezdev.net");
  env.set(
    "CORS_ORIGINS",
    "https://staging.tudu.rraj.dev,https://staging.tudu.ezdev.net,tauri://localhost",
  );
}

async function listDomainHosts(composeId) {
  const json = await apiGet(
    `/api/domain.byComposeId?composeId=${encodeURIComponent(composeId)}`,
  );
  const rows = Array.isArray(json) ? json : json.data ?? json.result ?? [];
  return new Set(
    rows.map((d) => (d.host ?? d.domain ?? "").toLowerCase()).filter(Boolean),
  );
}

async function ensureDomain(composeId, host, serviceName, port) {
  const hosts = await listDomainHosts(composeId);
  if (hosts.has(host.toLowerCase())) {
    console.log(`  domain ${host} already exists`);
    return;
  }
  await apiPost("/api/domain.create", {
    host,
    composeId,
    serviceName,
    port,
    https: true,
    certificateType: "letsencrypt",
    domainType: "compose",
    stripPath: false,
  });
  console.log(`  created domain ${host} -> ${serviceName}:${port}`);
}

async function updateStack(composeId, mode, domains) {
  console.log(`\n=== ${mode} (${composeId}) ===`);
  const raw = await composeEnv(composeId);
  const env = parseEnv(raw);
  if (mode === "prod") {
    applyProdEnv(env);
  } else {
    applyStagingEnv(env);
  }
  await apiPost("/api/compose.saveEnvironment", {
    composeId,
    env: serializeEnv(env),
    createEnvFile: true,
  });
  console.log("  saved environment");

  for (const { host, serviceName, port } of domains) {
    await ensureDomain(composeId, host, serviceName, port);
  }

  await apiPost("/api/compose.deploy", {
    composeId,
    title: `Switch to ezdev.net (${mode})`,
    description: "Route53 + CORS + domains",
  });
  console.log("  triggered deploy");
}

await updateStack(prodComposeId, "prod", [
  { host: "tudu.ezdev.net", serviceName: "web", port: 80 },
  { host: "api.tudu.ezdev.net", serviceName: "server", port: 3456 },
]);

await updateStack(stagingComposeId, "staging", [
  { host: "staging.tudu.ezdev.net", serviceName: "web", port: 80 },
  { host: "api.staging.tudu.ezdev.net", serviceName: "server", port: 3456 },
]);

console.log("\nDone.");
