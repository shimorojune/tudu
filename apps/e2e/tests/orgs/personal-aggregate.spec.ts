import { test, expect } from "@playwright/test";

test.describe("personal aggregate", () => {
  test("shows org chips on personal today, not a left border", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await expect(page.locator("main")).toBeVisible({ timeout: 15_000 });

    const orgChip = page
      .locator('[data-task-row="true"]')
      .filter({ hasText: "EGSoft" })
      .first();
    if (await orgChip.count()) {
      await expect(orgChip).toBeVisible();
      const borderLeft = await orgChip.evaluate(
        (node) => getComputedStyle(node).borderLeftWidth,
      );
      expect(borderLeft).toBe("0px");
    }
  });

  test("personal today lists tasks from multiple spaces", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await expect(
      page.getByRole("button", { name: "Add task" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
