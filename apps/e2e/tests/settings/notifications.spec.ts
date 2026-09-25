import { test, expect } from "@playwright/test";

test("notification settings load and toggle events", async ({ page }) => {
  await page.goto("/settings?section=notifications");
  await expect(page.getByRole("switch", { name: "System alerts" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Event notifications" })).toBeVisible();
  await page.getByRole("switch", { name: "Event notifications" }).click();
  await expect(page.getByRole("switch", { name: "JIRA event notifications" })).toBeDisabled();
  await page.getByRole("radio", { name: "30 minutes" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "30 minutes" })).toHaveAttribute(
    "data-state",
    "on",
  );
});
