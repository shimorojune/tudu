import { test, expect } from "@playwright/test";

test("notification settings load and toggle inbox", async ({ page }) => {
  await page.goto("/settings?section=notifications");
  await expect(page.getByRole("switch", { name: "Focus check-in notifications" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Inbox notifications" })).toBeVisible();
  await page.getByRole("switch", { name: "Inbox notifications" }).click();
  await expect(page.getByText("Linked JIRA issues")).toBeVisible();
});
