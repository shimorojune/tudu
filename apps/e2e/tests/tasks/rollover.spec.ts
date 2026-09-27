import { expect, test } from "@playwright/test";

test.describe("Rollover UI", () => {
  test("Today route renders without midnight error overlay", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});
