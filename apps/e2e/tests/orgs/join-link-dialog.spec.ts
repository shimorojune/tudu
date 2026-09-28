import { expect, test } from "@playwright/test";

test("opens join with a link dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch space" }).click();
  await page.getByText("Join with a link").click();
  await expect(
    page.getByRole("heading", { name: "Join with a link" }),
  ).toBeVisible();
});
