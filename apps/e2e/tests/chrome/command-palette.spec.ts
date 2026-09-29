import { expect, test } from "@playwright/test";
import { openCommandPalette } from "../../helpers/day-navigation.js";

test.describe("Command palette", () => {
  test("opens with keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await openCommandPalette(page);
    await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
  });
});
