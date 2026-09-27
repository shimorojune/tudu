import { expect, test } from "@playwright/test";

test.describe("Command palette", () => {
  test("opens with keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
  });
});
