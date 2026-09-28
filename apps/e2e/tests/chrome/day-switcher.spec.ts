import { expect, test } from "@playwright/test";

test.describe("Day switcher in Today tab", () => {
  test("steps to tomorrow and back to today", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await expect(page.getByRole("button", { name: /Today/ })).toBeVisible();

    await page.getByLabel(/Next day/).click();
    await expect(page.getByRole("button", { name: /Tomorrow/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to today" })).toBeVisible();

    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(page.getByRole("button", { name: /Today/ })).toBeVisible();
  });
});
