import { expect, test } from "@playwright/test";

test.describe("Week view", () => {
  test("loads the week grid", async ({ page }) => {
    await page.goto("/week");
    await page.waitForURL("/week");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  });
});
