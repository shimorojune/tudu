import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eRoot = path.join(__dirname, "..");
const authFile = path.join(e2eRoot, ".auth", "user.json");
const outDir = path.join(e2eRoot, "screenshots-tiptap");

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: authFile,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add task" }).first().waitFor({ timeout: 60_000 });

  await page.getByRole("button", { name: "Add task" }).first().click();
  await page.getByPlaceholder("What needs doing?").waitFor();
  await page.screenshot({
    path: path.join(outDir, "new-task-dialog-tiptap.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");

  const taskBtn = page.getByRole("button", { name: /Comment flash check/ }).first();
  if (await taskBtn.count()) {
    await taskBtn.click();
    await page.getByLabel("Task description").waitFor();
    await page.screenshot({
      path: path.join(outDir, "inspector-description-tiptap.png"),
      fullPage: true,
    });
  }

  await browser.close();
}

void main();
