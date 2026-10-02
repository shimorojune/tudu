import { expect, test } from "@playwright/test";
import {
  dismissCommandsIfOpen,
  effectiveLocalTodayIso,
  ensureTodayPage,
  goToDate,
  shiftLocalIso,
} from "../../helpers/day-navigation.js";
import {
  addTaskInBucket,
  addUnscheduledTask,
  bucketSection,
  captureReviewScreenshot,
  ensureTaskListInteractive,
  expectCompletedSectionAfterBuckets,
  expandCompletedSection,
  markTaskComplete,
  markTaskIncomplete,
  taskRow,
  uniqueTitle,
} from "../../helpers/completed-section.js";

test.describe("Completed section on Today", () => {
  test("open tasks stay in buckets; completed moves below Later", async ({ page }) => {
    await ensureTodayPage(page);

    const title = uniqueTitle("Completed bucket move");
    await addTaskInBucket(page, "Now", title);
    await captureReviewScreenshot(page, "today-before-complete");

    await expect(bucketSection(page, "Now").getByText(title)).toBeVisible();
    await markTaskComplete(page, title);

    await expect(bucketSection(page, "Now").getByText(title)).toHaveCount(0);
    await expect(bucketSection(page, "Next").getByText(title)).toHaveCount(0);
    await expect(bucketSection(page, "Later").getByText(title)).toHaveCount(0);
    await expect(page.getByTestId("completed-section")).toBeVisible();
    await expect(page.getByTestId("completed-section-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(taskRow(page, title)).not.toBeVisible();

    await expandCompletedSection(page);
    await expect(taskRow(page, title)).toBeVisible();
    await captureReviewScreenshot(page, "today-completed-expanded");

    await markTaskIncomplete(page, title);
    await expect(bucketSection(page, "Now").getByText(title)).toBeVisible();
    const completedRows = page.getByTestId("completed-section-rows");
    if (await completedRows.isVisible()) {
      await expect(completedRows.getByText(title)).toHaveCount(0);
    }
    await captureReviewScreenshot(page, "today-reopened");
  });
});

test.describe("Completed section on a past day", () => {
  test("uses Priority labels and keeps completed out of buckets", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await ensureTodayPage(page);
    const yesterday = shiftLocalIso(effectiveLocalTodayIso(), -1);
    await goToDate(page, yesterday);
    await dismissCommandsIfOpen(page);
    await expect(
      page.locator("section").filter({
        has: page.locator("header").getByText("Priority 1", { exact: true }),
      }),
    ).toBeVisible({ timeout: 15_000 });

    const title = uniqueTitle("E2E yday done");
    await addTaskInBucket(page, "Priority 3", title, { preserveCurrentDay: true });
    await markTaskComplete(page, title);

    const laterSection = page.locator("section").filter({
      has: page.locator("header").getByText("Priority 3", { exact: true }),
    });
    await expect(laterSection.getByText(title)).toHaveCount(0);
    await expandCompletedSection(page);
    await expect(taskRow(page, title)).toBeVisible();
    await captureReviewScreenshot(page, "yesterday-completed");
  });
});

test.describe("Completed section on Unscheduled", () => {
  test("splits open backlog from completed rows", async ({ page }) => {
    await page.goto("/unscheduled", { waitUntil: "domcontentloaded" });
    await dismissCommandsIfOpen(page);
    await expect(page).toHaveURL(/\/unscheduled/);

    const title = uniqueTitle("Unscheduled completed");
    await addUnscheduledTask(page, title);

    await markTaskComplete(page, title);
    await expect(page.locator('[data-task-row="true"]').filter({ hasText: title })).toHaveCount(0);

    await expandCompletedSection(page);
    await expect(taskRow(page, title)).toBeVisible();
    await captureReviewScreenshot(page, "unscheduled-completed");
  });
});

test.describe("Completed section collapse preference", () => {
  test("persists expanded state in localStorage", async ({ page }) => {
    test.setTimeout(60_000);
    await ensureTodayPage(page);

    const title = uniqueTitle("Persist expanded");
    await addTaskInBucket(page, "Next", title);
    await markTaskComplete(page, title);
    await expandCompletedSection(page);
    await expect(page.getByTestId("completed-section-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(taskRow(page, title)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(async () => {
      await ensureTodayPage(page);
      await ensureTaskListInteractive(page);
      await expect(page.getByTestId("completed-section-toggle")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await expect(taskRow(page, title)).toBeVisible();
    }).toPass({ timeout: 30_000 });
    await captureReviewScreenshot(page, "persist-expanded-reload");
  });
});

test.describe("Completed section viewport matrix", () => {
  test("completed section follows open buckets in the layout", async ({ page }) => {
    test.setTimeout(60_000);
    await ensureTodayPage(page);

    const title = uniqueTitle("Layout completed");
    await addTaskInBucket(page, "Later", title);
    await markTaskComplete(page, title);
    await expandCompletedSection(page);
    await expect(taskRow(page, title)).toBeVisible();
    await expectCompletedSectionAfterBuckets(page);
  });
});
