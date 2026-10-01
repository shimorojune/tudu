import { expect, test } from "@playwright/test";

test.describe("settings appearance", () => {
  test("dark theme persists on html after selection", async ({ page }) => {
    await page.goto("/settings?section=general");
    await page.waitForURL(/\/settings/);

    await page.getByRole("button", { name: "Dark" }).click();

    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await page.waitForURL(/\/settings/);

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("palette preset persists after selection", async ({ page }) => {
    await page.goto("/settings?section=general");
    await page.waitForURL(/\/settings/);

    await page.getByRole("button", { name: "Dark" }).click();
    await page.getByRole("button", { name: "Neutral" }).click();

    await expect(page.locator("html")).toHaveCSS("--background", "#171717");

    await page.reload();
    await page.waitForURL(/\/settings/);

    await expect(page.locator("html")).toHaveCSS("--background", "#171717");
  });
});
