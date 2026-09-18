import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repoRoot, ".env");
const snippetPath = path.join(repoRoot, ".env.dokploy.firebase.snippet");

const vapidKey =
  process.argv[2] ??
  "BGENO4EODTLDOOHUfkWdY2X7W1gZGAI_H2NBbcVPD5Z5Zacpt_untdudT6J5Xb4vPzVe2vPRosOcYhmE427TOEs";
const serviceAccountPath =
  process.argv[3] ??
  path.join(
    process.env.HOME ?? "",
    "Downloads/tudu-ltm-firebase-adminsdk-fbsvc-d35d95c7c5.json",
  );

const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
const fcmJson = JSON.stringify(serviceAccount);

let env = await readFile(envPath, "utf8");

function upsertLine(key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(env)) {
    env = env.replace(pattern, line);
  } else {
    env = `${env.trimEnd()}\n${line}\n`;
  }
}

upsertLine("VITE_FIREBASE_VAPID_KEY", vapidKey);
upsertLine("FCM_SERVICE_ACCOUNT_JSON", fcmJson);

await writeFile(envPath, env, "utf8");

const firebaseClient = {
  VITE_FIREBASE_API_KEY: "AIzaSyAcvuEOl0ySo03n86RHLM-RgnPdclxPWqM",
  VITE_FIREBASE_AUTH_DOMAIN: "tudu-ltm.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "tudu-ltm",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "591042767794",
  VITE_FIREBASE_APP_ID: "1:591042767794:web:e378fa7a89e1e0b90152ab",
  VITE_FIREBASE_VAPID_KEY: vapidKey,
};

const snippet = [
  "# Append or merge into Dokploy compose environment (Tudu prod).",
  "# Rebuild web after VITE_* changes; redeploy server after FCM_*.",
  ...Object.entries(firebaseClient).map(([key, value]) => `${key}=${value}`),
  `FCM_SERVICE_ACCOUNT_JSON=${fcmJson}`,
  "",
].join("\n");

await writeFile(snippetPath, snippet, "utf8");
console.log("Updated .env and wrote .env.dokploy.firebase.snippet (gitignored).");
