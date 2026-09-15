import { expect, test } from "@playwright/test";
import { isJiraConnected } from "../../helpers/jira";

test.describe("Jira JQL filter chrome", () => {
  test.beforeEach(async ({ page }) => {
    if (!(await isJiraConnected(page))) {
      test.skip();
    }
    await page.goto("/");
    await page.waitForURL("/");
  });

  test("aligns preset select and custom JQL button heights", async ({ page }) => {
    const preset = page.getByLabel("JQL preset");
    const custom = page.getByRole("button", { name: "Custom JQL" });

    await expect(preset).toBeVisible();
    await expect(custom).toBeVisible();

    const presetBox = await preset.boundingBox();
    const customBox = await custom.boundingBox();
    expect(presetBox).not.toBeNull();
    expect(customBox).not.toBeNull();
    expect(Math.abs(presetBox!.height - customBox!.height)).toBeLessThanOrEqual(1);
  });

  test("applies custom JQL from the dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Custom JQL" }).click();
    await page.getByLabel("Custom JQL").fill('status = "Open"');
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByLabel("JQL preset")).toContainText("Custom JQL");
  });
});
