import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  dismissCommandsIfOpen,
  dismissMidnightBannerIfVisible,
  ensureTodayPage,
  goToYesterday as navigateToYesterday,
} from "./day-navigation.js";

const SCREENSHOT_DIR = path.join("test-results", "completed-section");

export async function captureReviewScreenshot(page: Page, label: string) {
  const project = test.info().project.name;
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${project}-${label}.png`),
    fullPage: true,
  });
}

export function taskRow(page: Page, title: string) {
  return page.locator('[data-task-row="true"]').filter({
    has: page.getByText(title, { exact: true }),
  });
}

export async function openTaskRowContextMenu(page: Page, title: string) {
  await dismissCommandsIfOpen(page);
  await ensureTaskListInteractive(page);
  const row = taskRow(page, title);
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  await page.keyboard.press("Shift+F10");
  if (!(await page.getByRole("menu").isVisible())) {
    await row.click({ button: "right", position: { x: 80, y: 16 } });
  }
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete this task?",
  });
  if (await deleteDialog.isVisible()) {
    await deleteDialog.getByRole("button", { name: "Cancel" }).click();
    await row.focus();
    await page.keyboard.press("Shift+F10");
  }
  await expect(page.getByRole("menu")).toBeVisible();
}

async function ensureNewTaskDialogSchedule(
  dialog: import("@playwright/test").Locator,
  bucket:
    | "Now"
    | "Next"
    | "Later"
    | "Priority 1"
    | "Priority 2"
    | "Priority 3",
) {
  if (
    bucket === "Now" ||
    bucket === "Next" ||
    bucket === "Later"
  ) {
    const todayBtn = dialog.getByRole("button", { name: "Today", exact: true });
    await todayBtn.scrollIntoViewIfNeeded();
    await todayBtn.click();
  }
  if (bucket === "Now") {
    const nowBtn = dialog.getByRole("button", { name: /^Now(\s|$)/ });
    await nowBtn.scrollIntoViewIfNeeded();
    await nowBtn.click();
  } else {
    const bucketButton = dialog.getByRole("button", {
      name: bucket,
      exact: true,
    });
    await bucketButton.scrollIntoViewIfNeeded();
    await expect(bucketButton).toBeEnabled({ timeout: 15_000 });
    await bucketButton.click();
  }
}

export async function openNewTaskForBucket(
  page: Page,
  bucket: "Now" | "Next" | "Later" | "Priority 1" | "Priority 2" | "Priority 3",
  options?: { preserveCurrentDay?: boolean },
) {
  if (options?.preserveCurrentDay) {
    await dismissCommandsIfOpen(page);
    await dismissMidnightBannerIfVisible(page);
  } else {
    await ensureTodayPage(page);
  }

  const submitBucket =
    bucket === "Priority 1"
      ? "Priority 1"
      : bucket === "Priority 2"
        ? "Priority 2"
        : bucket === "Priority 3"
          ? "Priority 3"
          : bucket;

  const project = test.info().project.name;
  if (project === "phone") {
    await expect(async () => {
      await dismissCommandsIfOpen(page);
      await dismissMidnightBannerIfVisible(page);
      await page.keyboard.press("n");
      await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
    }).toPass({ timeout: 30_000 });
  } else {
    const bucketSection = page.locator("section").filter({
      has: page.locator("header").getByText(bucket, { exact: true }),
    });
    const addTask = bucketSection.getByRole("button", { name: "Add task" });
    await bucketSection.scrollIntoViewIfNeeded();
    await addTask.evaluate((element) => {
      element.scrollIntoView({ block: "start", inline: "nearest" });
    });
    await expect(async () => {
      await addTask.scrollIntoViewIfNeeded();
      await addTask.click({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
  }

  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  await ensureNewTaskDialogSchedule(dialog, submitBucket);
  return dialog;
}

export async function addTaskInBucket(
  page: Page,
  bucket: "Now" | "Next" | "Later" | "Priority 1" | "Priority 2" | "Priority 3",
  title: string,
  options?: { preserveCurrentDay?: boolean },
) {
  const submitBucket =
    bucket === "Priority 1"
      ? "Priority 1"
      : bucket === "Priority 2"
        ? "Priority 2"
        : bucket === "Priority 3"
          ? "Priority 3"
          : bucket;

  const dialog = await openNewTaskForBucket(page, bucket, options);
  const titleInput = dialog.locator('input[placeholder="What needs doing?"]');
  await titleInput.fill(title);
  await ensureNewTaskDialogSchedule(dialog, submitBucket);
  const submit = dialog.getByRole("button", {
    name: new RegExp(`Add to ${submitBucket}`, "i"),
  });
  await expect(submit).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).not.toBeVisible();
  await expect(async () => {
    const row = taskRow(page, title);
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
  }).toPass({ timeout: 30_000 });
}

export async function addUnscheduledTask(page: Page, title: string) {
  await dismissCommandsIfOpen(page);
  const project = test.info().project.name;
  if (project === "phone") {
    await expect(async () => {
      await dismissCommandsIfOpen(page);
      await page.keyboard.press("n");
      await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
    }).toPass({ timeout: 30_000 });
  } else {
    await page.getByRole("button", { name: "Add task" }).first().click();
  }
  const dialog = page.getByRole("dialog", { name: "New task" });
  const titleInput = dialog.locator('input[placeholder="What needs doing?"]');
  await titleInput.fill(title);
  await dialog
    .locator("button")
    .filter({ hasText: /^Unscheduled$/ })
    .click();
  const submit = dialog.getByRole("button", { name: "Add to Unscheduled" });
  await expect(submit).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).not.toBeVisible();
  await expect(async () => {
    const row = taskRow(page, title);
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
  }).toPass({ timeout: 30_000 });
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

export async function pickProjectInNewTaskDialog(
  dialog: import("@playwright/test").Locator,
  page: Page,
  projectName: string,
) {
  await dialog.getByRole("button", { name: "Project" }).click();
  await page
    .getByRole("button")
    .filter({ hasText: projectName })
    .last()
    .click();
  await dismissCommandsIfOpen(page);
}

export async function addTaskInBucketWithProject(
  page: Page,
  bucket: "Now" | "Next" | "Later",
  title: string,
  projectName: string,
) {
  const dialog = await openNewTaskForBucket(page, bucket);
  await pickProjectInNewTaskDialog(dialog, page, projectName);
  const titleInput = dialog.locator('input[placeholder="What needs doing?"]');
  await titleInput.fill(title);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).not.toBeVisible();
  await expect(async () => {
    const row = taskRow(page, title);
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
  }).toPass({ timeout: 30_000 });
}

export async function rowCenterY(page: Page, title: string): Promise<number> {
  const box = await taskRow(page, title).boundingBox();
  if (!box) {
    throw new Error(`No bounding box for task row: ${title}`);
  }
  return box.y + box.height / 2;
}

/** Completed block must appear after the Later bucket in document order. */
export async function expectCompletedSectionAfterBuckets(page: Page) {
  const follows = await page.evaluate(() => {
    const completed = document.querySelector('[data-testid="completed-section"]');
    const laterHeader = [...document.querySelectorAll("section header")].find(
      (header) => header.textContent?.trim().startsWith("Later"),
    );
    const laterSection = laterHeader?.closest("section");
    if (!completed || !laterSection) {
      return false;
    }
    return (
      laterSection.compareDocumentPosition(completed) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ) !== 0;
  });
  expect(follows).toBe(true);
}

export function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()}`;
}
