import { test, expect } from "@playwright/test";

test("notification settings load and toggle activity", async ({ page }) => {
  await page.goto("/settings?section=notifications");
  await expect(page.getByRole("switch", { name: "System alerts" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Activity notifications" })).toBeVisible();
  await page.getByRole("switch", { name: "Activity notifications" }).click();
  await expect(page.getByRole("switch", { name: "Work reminder notifications" })).toBeVisible();
});
