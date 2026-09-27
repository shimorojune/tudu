import { expect, test } from "@playwright/test";

test.describe("Inbox", () => {
  test("loads inbox list", async ({ page }) => {
    await page.goto("/inbox");
    await page.waitForURL("/inbox");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  });
});
