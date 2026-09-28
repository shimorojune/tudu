import { test, expect } from "@playwright/test";

test.describe("onboarding", () => {
  test("existing seeded user lands on today", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Now", { exact: true }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/welcome/);
  });
});
