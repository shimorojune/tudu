import { expect, test } from "@playwright/test";

test("task ID appears in the inspector details tab", async ({ page }) => {
  await page.goto("/today");
  await page.waitForURL(/\/today/);
  const firstTaskRow = page.locator('[data-task-row="true"]').first();
  await expect(firstTaskRow).toBeVisible({ timeout: 15_000 });
  await firstTaskRow.click();
  await expect(page.getByText("Task ID")).toBeVisible();
  await expect(page.getByText(/^[A-Z]{2,5}-\d+$/)).toBeVisible();
});
