import { expect, test } from "@playwright/test";

test.describe("Requests (legacy inbox path)", () => {
  test("loads requests list", async ({ page }) => {
    await page.goto("/requests");
    await page.waitForURL("/requests");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  });
});
