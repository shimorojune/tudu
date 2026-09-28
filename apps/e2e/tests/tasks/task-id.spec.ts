import { expect, test } from "@playwright/test";

test("task ID appears in the inspector details tab", async ({ page }) => {
  await page.goto("/today");
  const firstTask = page.getByRole("button", { name: /./ }).first();
  await firstTask.click();
  await expect(page.getByText("Task ID")).toBeVisible();
  await expect(page.getByText(/^[A-Z]{2,5}-\d+$/)).toBeVisible();
});
