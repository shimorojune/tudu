import { test, expect } from "@playwright/test";

test.describe("co-workers roster", () => {
  test("shows roster header and invite control", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Switch space" }).click();
    await page.getByText("New organization").click();
    const name = `E2E Coworkers ${Date.now()}`;
    await page.getByPlaceholder("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await page.waitForURL(new RegExp(`/o/${slug}`));
    await page.goto(`/o/${slug}/coworkers`);
    await expect(page.getByRole("heading", { name: /In / })).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("button", { name: "Invite co-workers" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite co-workers" })).toHaveCount(
      1,
    );
    await expect(
      page.getByText(/Slipping = carried two days or more/),
    ).toBeVisible();
  });
});
