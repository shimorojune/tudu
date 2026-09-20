import { test, expect } from "@playwright/test";

test.describe("settings projects", () => {
  test("shows picker and archived sections with archive-gated delete", async ({
    page,
  }) => {
    await page.goto("/settings?section=projects");
    await expect(page.getByText("In the pickers")).toBeVisible();
    await expect(
      page.getByText(/only archived projects can be deleted/),
    ).toBeVisible();

    const createName = `E2E project ${Date.now()}`;
    await page.getByLabel("New project name").fill(createName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(createName)).toBeVisible();

    const row = page.locator("li", { hasText: createName });
    await row.hover();
    await row.getByRole("button", { name: "Archive" }).click();

    const archivedRow = page.locator("li", { hasText: createName });
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow.getByRole("button", { name: "Delete" })).toBeVisible();
  });
});
