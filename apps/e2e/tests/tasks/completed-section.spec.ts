import { expect, test } from "@playwright/test";
import {
  addTaskInBucket,
  addUnscheduledTask,
  bucketSection,
  captureReviewScreenshot,
  ensureTaskListInteractive,
  expandCompletedSection,
  goToYesterday,
  markTaskComplete,
  markTaskIncomplete,
  taskRow,
  uniqueTitle,
} from "../../helpers/completed-section";

test.describe("Completed section on Today", () => {
  test("open tasks stay in buckets; completed moves below Later", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");

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
  test("uses Priority labels and keeps completed out of buckets", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");

    await goToYesterday(page);

    const title = uniqueTitle("Yesterday completed");
    await addTaskInBucket(page, "Priority 3", title);
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
    await page.goto("/unscheduled");
    await page.waitForURL("/unscheduled");

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
    await page.goto("/");
    await page.waitForURL("/");

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
    await expect(page.getByTestId("task-list-header")).toBeVisible();
    await ensureTaskListInteractive(page);

    await expect(page.getByTestId("completed-section-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(taskRow(page, title)).toBeVisible();
    await captureReviewScreenshot(page, "persist-expanded-reload");
  });
});

test.describe("Completed section viewport matrix", () => {
  test("tablet layout keeps completed below buckets", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "tablet project only");

    await page.goto("/");
    await page.waitForURL("/");

    const title = uniqueTitle("Tablet completed");
    await addTaskInBucket(page, "Later", title);
    await markTaskComplete(page, title);
    await expandCompletedSection(page);
    await captureReviewScreenshot(page, "tablet-completed");
  });

  test("phone layout keeps completed below buckets", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "phone project only");

    await page.goto("/");
    await page.waitForURL("/");

    const title = uniqueTitle("Phone completed");
    await addTaskInBucket(page, "Now", title);
    await markTaskComplete(page, title);
    await expandCompletedSection(page);
    await captureReviewScreenshot(page, "phone-completed");
  });
});
