import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";
import { E2E_WEB_URL } from "../constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, "../.auth");
const authFile = path.join(authDir, "user.json");
const managerAuthFile = path.join(authDir, "manager.json");
const priyaAuthFile = path.join(authDir, "priya.json");

async function signInAndSave(
  email: string,
  password: string,
  storagePath: string,
) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${E2E_WEB_URL}/sign-in`);
  await page.locator("#sign-in-email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${E2E_WEB_URL}/`);

  await page.context().storageState({ path: storagePath });
  await browser.close();
}

setup("authenticate test user", async () => {
  await signInAndSave("testuser@egain.com", "egain@123", authFile);
});

setup("authenticate manager", async () => {
  await signInAndSave("marcus@egain.com", "egain@123", managerAuthFile);
});

setup("authenticate priya", async () => {
  await signInAndSave("priya@egain.com", "egain@123", priyaAuthFile);
});
