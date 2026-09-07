import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createDb, user } from "@tudu/db";
import { eq } from "drizzle-orm";
import { createAuth } from "../src/auth.js";

const TEST_EMAIL = "testuser@egain.com";
const TEST_PASSWORD = "egain@123";
const TEST_NAME = "Test User";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, "../../../.env") });

function resolveTrustedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length
    ? configured
    : [
        "http://localhost:1420",
        "http://localhost:5173",
        "tauri://localhost",
      ];
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed test user in production");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  const auth = createAuth(db, resolveTrustedOrigins());

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, TEST_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log("Test user already present");
    return;
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME,
      },
    });
    console.log(`Seeded test user ${TEST_EMAIL}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log("Test user already present");
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
