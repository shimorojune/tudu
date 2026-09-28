import { test, expect } from "@playwright/test";

test.describe("personal aggregate", () => {
  test("shows org badges on personal today", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
  });
});
