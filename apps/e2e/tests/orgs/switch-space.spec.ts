import { expect, test } from "@playwright/test";

test("space switcher lists personal space", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch space" }).click();
  await expect(
    page.getByRole("menuitem", { name: /Personal/ }),
  ).toBeVisible();
});
