import { expect, test } from "@playwright/test";

test("task ID appears in the inspector details tab", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("/");
  const firstTaskRow = page.locator('[data-task-row="true"]').first();
  await expect(firstTaskRow).toBeVisible({ timeout: 15_000 });
  await firstTaskRow.click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByText("Task ID")).toBeVisible();
  await expect(inspector.getByText(/^[A-Z]{2,5}-\d+$/)).toBeVisible();
});
