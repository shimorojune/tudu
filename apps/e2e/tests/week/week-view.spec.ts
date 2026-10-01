import { expect, test } from "@playwright/test";
import { dismissCommandsIfOpen } from "../../helpers/day-navigation.js";

test.describe("Week view", () => {
  test("loads the week grid", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/week", { waitUntil: "domcontentloaded" });
    await dismissCommandsIfOpen(page);
    await expect(page).toHaveURL(/\/week/);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  });
});
