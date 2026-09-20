/**
 * One-off: build staging Dokploy env from prod compose and apply overrides.
 * Usage: node scripts/provision-staging-dokploy-env.mjs <stagingComposeId>
 * Reads API key from ~/.cursor/mcp.json personal-dokploy-mcp.
 * Staging secrets: STAGING_DATABASE_URL, STAGING_S3_ACCESS_KEY_ID, STAGING_S3_SECRET_ACCESS_KEY
 * (optional env vars; falls back to Neon MCP defaults for DB only when unset).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingComposeId = process.argv[2];
const prodComposeId = process.argv[3] ?? "xHlWJkHiQM3I84MDAjXh5";

if (!stagingComposeId) {
  console.error("Usage: node scripts/provision-staging-dokploy-env.mjs <stagingComposeId>");
  process.exit(1);
}

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

async function composeOne(composeId) {
  const res = await fetch(
    `${apiUrl}/api/compose.one?composeId=${encodeURIComponent(composeId)}`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!res.ok) {
    throw new Error(`compose.one ${composeId} failed: ${res.status}`);
  }
  const json = await res.json();
  const env =
    typeof json.env === "string"
      ? json.env
      : typeof json.data?.env === "string"
        ? json.data.env
        : "";
  return env;
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

const stagingDb =
  process.env.STAGING_DATABASE_URL?.trim() ??
  "postgresql://neondb_owner:npg_8rE4IkMxigCB@ep-nameless-poetry-b3rtjvll-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const s3Endpoint =
  "https://br-floral-flower-az3v8pny.storage.c-3.ap-southeast-1.aws.neon.tech";
const s3Access = process.env.STAGING_S3_ACCESS_KEY_ID?.trim();
const s3Secret = process.env.STAGING_S3_SECRET_ACCESS_KEY?.trim();
if (!s3Access || !s3Secret) {
  console.error(
    "Set STAGING_S3_ACCESS_KEY_ID and STAGING_S3_SECRET_ACCESS_KEY in the environment.",
  );
  process.exit(1);
}

const prodEnv = await composeOne(prodComposeId);
const env = parseEnv(prodEnv);

env.set("DATABASE_URL", stagingDb);
env.set("BETTER_AUTH_URL", "https://api.staging.tudu.ezdev.net");
env.set("BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
env.set(
  "CORS_ORIGINS",
  "https://staging.tudu.rraj.dev,https://staging.tudu.ezdev.net,tauri://localhost",
);
env.set("VITE_API_URL", "https://api.staging.tudu.ezdev.net");
env.set("UPDATES_PUBLIC_BASE_URL", "https://api.staging.tudu.ezdev.net");
env.set("UPDATES_RELEASE_CHANNEL", "staging");
env.set("ATTACHMENT_STORAGE", "minio");
env.set("S3_ENDPOINT", s3Endpoint);
env.set("S3_REGION", "ap-southeast-1");
env.set("S3_BUCKET", "assets");
env.set("S3_ACCESS_KEY_ID", s3Access);
env.set("S3_SECRET_ACCESS_KEY", s3Secret);
env.set(
  "JIRA_TOKEN_ENCRYPTION_KEY",
  randomBytes(32).toString("hex").slice(0, 32),
);

const out = serializeEnv(env);
await saveEnvironment(stagingComposeId, out);
console.log(`Saved staging environment for compose ${stagingComposeId}`);
