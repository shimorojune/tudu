import { expect, test } from "@playwright/test";

test.describe("Team (legacy route)", () => {
  test("redirects away from removed /team path", async ({ page }) => {
    await page.goto("/team");
    await expect(page).not.toHaveURL(/\/team$/);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});
