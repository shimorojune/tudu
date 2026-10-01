import { expect, test } from "@playwright/test";

test.describe("settings default section", () => {
  test("opens general when visiting /settings", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL(/section=general/);
    await expect(
      page.getByRole("heading", { name: "General", level: 1 }),
    ).toBeVisible();
  });

  test("settings icon lands on general", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL(/section=general/);
    await expect(
      page.getByRole("heading", { name: "General", level: 1 }),
    ).toBeVisible();
  });
});
