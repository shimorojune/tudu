import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type FullConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, ".auth");
const authFile = path.join(authDir, "user.json");
const repoRoot = path.resolve(__dirname, "../..");

async function globalSetup(config: FullConfig) {
  execSync("pnpm db:seed", { cwd: repoRoot, stdio: "inherit" });

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:5173";
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/sign-in`);
  await page.locator("#sign-in-email").fill("testuser@egain.com");
  await page.locator("#sign-in-password").fill("egain@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${baseURL}/`);

  await page.context().storageState({ path: authFile });
  await browser.close();
}

export default globalSetup;
