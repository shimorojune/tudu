import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  addTaskInBucketWithProject,
  ensureTaskListInteractive,
  taskRow,
  uniqueTitle,
} from "../../helpers/completed-section.js";
import {
  dismissCommandsIfOpen,
  effectiveLocalTodayIso,
  ensureTodayPage,
} from "../../helpers/day-navigation.js";

async function openProjectFilter(page: Page) {
  await dismissCommandsIfOpen(page);
  await ensureTaskListInteractive(page);
  const header = page.getByTestId("task-list-header");
  await expect(header).toBeVisible();
  await header.getByRole("button").first().click();
}

test.describe("project filter placement", () => {
  test("lives in the task list header, not the top nav", async ({ page }) => {
    await ensureTodayPage(page);

    const topNav = page.getByTestId("top-nav");
    const taskHeader = page.getByTestId("task-list-header");

    await expect(taskHeader).toBeVisible();
    await expect(taskHeader.getByRole("button", { name: "All projects" })).toBeVisible();
    await expect(topNav.getByRole("button", { name: "All projects" })).toHaveCount(0);
  });

  test("filters visible tasks when a project is selected", async ({ page }) => {
    test.setTimeout(90_000);
    await ensureTodayPage(page);

    const egsTitle = uniqueTitle("Filter EGS");
    const homeTitle = uniqueTitle("Filter Home");
    await addTaskInBucketWithProject(page, "Later", egsTitle, "EGS");
    await addTaskInBucketWithProject(page, "Later", homeTitle, "Home");
    await dismissCommandsIfOpen(page);
    await ensureTaskListInteractive(page);

    await expect(taskRow(page, egsTitle)).toBeVisible();
    await expect(taskRow(page, homeTitle)).toBeVisible();

    await openProjectFilter(page);
    await page.getByRole("button").filter({ hasText: "EGS" }).last().click({ force: true });

    await expect(taskRow(page, egsTitle)).not.toHaveClass(/opacity-35/);
    await expect(taskRow(page, homeTitle)).toHaveClass(/opacity-35/);

    await page.goto(`/?date=${effectiveLocalTodayIso()}`);
    await dismissCommandsIfOpen(page);
    await ensureTaskListInteractive(page);
    await expect(taskRow(page, egsTitle)).toBeVisible();
    await expect(taskRow(page, homeTitle)).toBeVisible();
    await expect(taskRow(page, egsTitle)).not.toHaveClass(/opacity-35/);
    await expect(taskRow(page, homeTitle)).not.toHaveClass(/opacity-35/);
  });
});
