import { expect, test } from "@playwright/test";

test.describe("OAuth consent", () => {
  test("shows missing request copy without oauth query", async ({ page }) => {
    await page.goto("/oauth/consent");
    await expect(
      page.getByText("Missing authorization request."),
    ).toBeVisible();
  });

  test("shows allow and deny for signed-in user with oauth query", async ({
    page,
  }) => {
    await page.goto(
      "/oauth/consent?client_id=e2e-client&scope=tasks%3Aread&code=test-code",
    );
    await expect(page.getByRole("heading", { name: "Allow access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Allow" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Deny" })).toBeVisible();
  });
});
