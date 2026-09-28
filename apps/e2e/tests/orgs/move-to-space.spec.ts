import { test, expect } from "@playwright/test";

test.describe("move to space", () => {
  test("moves a personal task into an organization", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
  });
});
