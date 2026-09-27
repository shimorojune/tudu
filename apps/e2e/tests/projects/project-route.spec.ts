import { expect, test } from "@playwright/test";

test.describe("Project route", () => {
  test("opens first project from settings list", async ({ page }) => {
    await page.goto("/settings?section=projects");
    await page.waitForURL(/section=projects/);
    const projectLink = page.getByRole("link").filter({ hasText: /EGS|Home/i }).first();
    await expect(projectLink).toBeVisible({ timeout: 15_000 });
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\//);
  });
});
