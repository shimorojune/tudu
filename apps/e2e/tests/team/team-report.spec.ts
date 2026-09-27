import { expect, test } from "@playwright/test";

test.describe("Team", () => {
  test("manager roster loads", async ({ page }) => {
    await page.goto("/team");
    await page.waitForURL("/team");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  });
});
