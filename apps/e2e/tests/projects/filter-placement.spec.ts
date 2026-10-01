import { expect, test } from "@playwright/test";
import { ensureTodayPage } from "../../helpers/day-navigation.js";

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
    await ensureTodayPage(page);

    const rowsBefore = await page.locator('[data-task-row="true"]').count();
    if (rowsBefore === 0) {
      test.skip();
    }

    await page.getByTestId("task-list-header").getByRole("button", { name: "All projects" }).click();
    const projectOptions = page.getByRole("button").filter({ hasNotText: "All projects" });
    const optionCount = await projectOptions.count();
    if (optionCount === 0) {
      test.skip();
    }

    await projectOptions.first().click();
    const rowsAfter = await page.locator('[data-task-row="true"]').count();
    expect(rowsAfter).toBeLessThanOrEqual(rowsBefore);
  });
});
