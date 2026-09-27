import { expect, test } from "@playwright/test";
import { E2E_WEB_URL } from "../../constants.js";

test.describe("Auth", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(`${E2E_WEB_URL}/sign-in`);
    await expect(page.locator("#sign-in-email")).toBeVisible();
  });

  test("rejects wrong password", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("#sign-in-email").fill("testuser@egain.com");
    await page.locator("#sign-in-password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/sign-in/);
  });
});
