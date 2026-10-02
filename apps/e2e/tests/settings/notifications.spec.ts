import { test, expect } from "@playwright/test";
import { dismissCommandsIfOpen } from "../../helpers/day-navigation.js";

test("notification settings load and toggle events", async ({ page }) => {
  await page.goto("/settings?section=notifications");
  await page.waitForURL(/section=notifications/);
  await dismissCommandsIfOpen(page);
  await expect(page.getByRole("switch", { name: "System alerts" })).toBeVisible({
    timeout: 15_000,
  });

  const eventsMaster = page.getByRole("switch", {
    name: "Event notifications",
    exact: true,
  });
  await expect(eventsMaster).toBeVisible();
  if ((await eventsMaster.getAttribute("aria-checked")) === "true") {
    await eventsMaster.click();
  }
  await expect(eventsMaster).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("switch", { name: "JIRA event notifications" }),
  ).toBeDisabled();

  const regular = page.getByRole("switch", {
    name: "Regular update notifications",
  });
  if ((await regular.getAttribute("aria-checked")) !== "true") {
    await regular.click();
  }
  const interval30 = page.getByRole("radio", { name: "30 minutes" });
  await expect(interval30).toBeVisible();
  await interval30.click();
  await expect(interval30).toHaveAttribute("data-state", "on");
});
