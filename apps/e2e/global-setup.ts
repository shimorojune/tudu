import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type FullConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, ".auth");
const authFile = path.join(authDir, "user.json");
const managerAuthFile = path.join(authDir, "manager.json");
const repoRoot = path.resolve(__dirname, "../..");

async function signInAndSave(
  baseURL: string,
  email: string,
  password: string,
  storagePath: string,
) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/sign-in`);
  await page.locator("#sign-in-email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${baseURL}/`);

  await page.context().storageState({ path: storagePath });
  await browser.close();
}

async function globalSetup(config: FullConfig) {
  execSync("pnpm db:migrate", { cwd: repoRoot, stdio: "inherit" });
  execSync("pnpm db:seed", { cwd: repoRoot, stdio: "inherit" });

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:5173";

  await signInAndSave(
    baseURL,
    "testuser@egain.com",
    "egain@123",
    authFile,
  );
  await signInAndSave(
    baseURL,
    "marcus@egain.com",
    "egain@123",
    managerAuthFile,
  );
}

export default globalSetup;
