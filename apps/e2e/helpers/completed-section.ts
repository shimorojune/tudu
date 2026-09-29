import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { goToYesterday as navigateToYesterday } from "./day-navigation.js";

const SCREENSHOT_DIR = path.join("test-results", "completed-section");

export async function captureReviewScreenshot(page: Page, label: string) {
  const project = test.info().project.name;
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${project}-${label}.png`),
    fullPage: true,
  });
}

export function taskRow(page: Page, title: string) {
  return page.locator('[data-task-row="true"]').filter({ hasText: title });
}

export async function addTaskInBucket(
  page: Page,
  bucket: "Now" | "Next" | "Later" | "Priority 1" | "Priority 2" | "Priority 3",
  title: string,
) {
  await page.keyboard.press("Escape");
  const submitBucket =
    bucket === "Priority 1"
      ? "Priority 1"
      : bucket === "Priority 2"
        ? "Priority 2"
        : bucket === "Priority 3"
          ? "Priority 3"
          : bucket;

  const bucketSection = page.locator("section").filter({
    has: page.locator("header").getByText(bucket, { exact: true }),
  });
  await bucketSection.getByRole("button", { name: "Add task" }).click();

  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  const titleInput = dialog.locator('input[placeholder="What needs doing?"]');
  await titleInput.fill(title);
  const submit = dialog.getByRole("button", {
    name: new RegExp(`Add to ${submitBucket}`, "i"),
  });
  await expect(submit).toBeEnabled();
  await titleInput.press("ControlOrMeta+Enter");
  await expect(dialog).not.toBeVisible();
  await expect(taskRow(page, title)).toBeVisible();
}

export async function addUnscheduledTask(page: Page, title: string) {
  await page.getByRole("button", { name: "Add task" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  const titleInput = dialog.locator('input[placeholder="What needs doing?"]');
  await titleInput.fill(title);
  await dialog
    .locator("button")
    .filter({ hasText: /^Unscheduled$/ })
    .click();
  const submit = dialog.getByRole("button", { name: "Add to Unscheduled" });
  await expect(submit).toBeEnabled();
  await titleInput.press("ControlOrMeta+Enter");
  await expect(dialog).not.toBeVisible();
  await expect(taskRow(page, title)).toBeVisible();
}

export async function ensureTaskListInteractive(page: Page) {
  const closeInspector = page.getByRole("button", { name: "Close inspector" });
  if (await closeInspector.isVisible()) {
    await closeInspector.click();
  }
}

export async function goToYesterday(page: Page) {
  await navigateToYesterday(page);
}

export async function markTaskComplete(page: Page, title: string) {
  await ensureTaskListInteractive(page);
  const row = taskRow(page, title);
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: "Mark complete" }).click();
}

export async function markTaskIncomplete(page: Page, title: string) {
  await ensureTaskListInteractive(page);
  const row = taskRow(page, title);
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: "Mark incomplete" }).click();
}

export async function expandCompletedSection(page: Page) {
  await ensureTaskListInteractive(page);
  const toggle = page.getByTestId("completed-section-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(page.getByTestId("completed-section-rows")).toBeVisible();
}

export function bucketSection(page: Page, bucket: "Now" | "Next" | "Later") {
  return page.locator("section").filter({
    has: page.locator("header").getByText(bucket, { exact: true }),
  });
}

export function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()}`;
}
