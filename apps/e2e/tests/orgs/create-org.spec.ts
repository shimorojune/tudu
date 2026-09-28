import { expect, test } from "@playwright/test";

test("creates an organization from the space switcher", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch space" }).click();
  await page.getByText("New organization").click();
  const name = `E2E Org ${Date.now()}`;
  await page.getByPlaceholder("Organization name").fill(name);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("button", { name: "Switch space" })).toContainText(
    name,
  );
  await expect(page.locator("main")).toBeVisible();
});
