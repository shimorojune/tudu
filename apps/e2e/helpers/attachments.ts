import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import {
  addTaskInBucket,
  addUnscheduledTask,
  ensureTaskListInteractive,
  taskRow,
  uniqueTitle,
} from "./completed-section";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(helpersDir, "..", "fixtures");

export const tinyPngPath = path.join(fixturesDir, "tiny.png");
export const notesTxtPath = path.join(fixturesDir, "notes.txt");

export async function dismissBlockingOverlays(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press("Escape");
    await page
      .locator("[data-state=open]")
      .first()
      .waitFor({ state: "hidden", timeout: 500 })
      .catch(() => undefined);
  }
}

export function descriptionEditor(page: Page) {
  return page
    .getByTestId("rich-text-editor")
    .filter({ has: page.getByRole("textbox", { name: "Task description" }) });
}

export async function selectTaskByTitle(page: Page, title: string) {
  await dismissBlockingOverlays(page);
  const row = taskRow(page, title);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  if (page.url().includes("/unscheduled")) {
    await expect(
      page.getByRole("dialog", { name: "Task details" }),
    ).toBeVisible({ timeout: 10_000 });
  }
  const detailsTab = page.getByRole("tab", { name: "Details" });
  if (await detailsTab.isVisible()) {
    await detailsTab.click();
  }
  await expect(descriptionEditor(page)).toBeVisible({ timeout: 15_000 });
}

export async function attachFileViaToolbar(page: Page, filePath: string) {
  const editor = descriptionEditor(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await editor.getByRole("button", { name: "Attach file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
}

export async function waitForDescriptionImage(page: Page) {
  const editor = descriptionEditor(page);
  await expect(editor.locator(".tudu-attachment-image img")).toBeVisible({
    timeout: 20_000,
  });
}

export async function blurDescriptionToSave(page: Page, taskTitle: string) {
  await page.getByRole("heading", { name: taskTitle, exact: true }).click();
  await expect(descriptionEditor(page)).toBeVisible();
}

export async function createTodayTask(page: Page, title: string) {
  await page.goto("/");
  await page.waitForURL("/");
  await addTaskInBucket(page, "Later", title);
  await selectTaskByTitle(page, title);
}

export async function createUnscheduledTask(page: Page, title: string) {
  await page.goto("/unscheduled");
  await page.waitForURL("/unscheduled");
  await ensureTaskListInteractive(page);
  await addUnscheduledTask(page, title);
  await selectTaskByTitle(page, title);
}

export function uniqueAttachmentTitle(prefix: string) {
  return uniqueTitle(prefix);
}

export async function writeOversizeFixture(): Promise<string> {
  const filePath = path.join(os.tmpdir(), `tudu-oversize-${Date.now()}.bin`);
  const stream = fs.createWriteStream(filePath);
  const chunk = Buffer.alloc(1024 * 1024, 1);
  for (let i = 0; i < 6; i += 1) {
    stream.write(chunk);
  }
  stream.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  return filePath;
}
