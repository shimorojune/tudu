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
import { dismissCommandsIfOpen, ensureTodayPage } from "./day-navigation.js";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(helpersDir, "..", "fixtures");

export const tinyPngPath = path.join(fixturesDir, "tiny.png");
export const notesTxtPath = path.join(fixturesDir, "notes.txt");

export async function dismissBlockingOverlays(page: Page) {
  await dismissCommandsIfOpen(page);
}

export function descriptionEditor(page: Page) {
  return page.getByTestId("rich-text-editor").first();
}

export async function selectTaskByTitle(page: Page, title: string) {
  await dismissCommandsIfOpen(page);
  await ensureTaskListInteractive(page);
  const row = taskRow(page, title);
  await expect(row).toBeVisible();
  const detailsTab = page.getByRole("tab", { name: "Details" });
  const editor = descriptionEditor(page);
  const inspector = detailsTab.or(editor);

  await expect(inspector)
    .toBeVisible({ timeout: 5_000 })
    .catch(async () => {
      await row.scrollIntoViewIfNeeded();
      await row.click();
      await dismissCommandsIfOpen(page);
    });

  if (await detailsTab.isVisible()) {
    await detailsTab.click();
  }

  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(editor).toBeVisible({ timeout: 15_000 });
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
  await expect(editor.locator(".tudu-attachment-image img")).toBeVisible();
}

export async function blurDescriptionToSave(page: Page, taskTitle: string) {
  await page.getByRole("heading", { name: taskTitle, exact: true }).click();
  await expect(descriptionEditor(page)).toBeVisible();
}

export async function createTodayTask(
  page: Page,
  title: string,
  orgSlug?: string,
) {
  if (orgSlug) {
    await ensureTodayPage(page, orgSlug);
  } else {
    await ensureTodayPage(page);
  }
  await addTaskInBucket(page, "Later", title);
  await selectTaskByTitle(page, title);
}

export async function createUnscheduledTask(page: Page, title: string) {
  await page.goto("/unscheduled");
  await page.waitForURL("/unscheduled");
  await ensureTaskListInteractive(page);
  await addUnscheduledTask(page, title);
}

let attachmentTitleSeq = 0;

export function uniqueAttachmentTitle(prefix: string) {
  attachmentTitleSeq += 1;
  const slug = prefix.replace(/\s+/g, "-");
  return `E2E-attach-${Date.now()}-${attachmentTitleSeq}-${slug}`;
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
