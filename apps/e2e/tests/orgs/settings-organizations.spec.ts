import { expect, test } from "@playwright/test";

test("shows organizations settings section", async ({ page }) => {
  await page.goto("/settings?section=organizations");
  await expect(
    page.getByRole("heading", { name: "Organizations" }),
  ).toBeVisible();
});

test("rights reference matches design 5.10 labels", async ({ page }) => {
  await page.goto("/settings?section=organizations");
  await page.getByRole("button", { name: "Who can do what" }).click();

  const readRow = page
    .locator("div")
    .filter({
      hasText: "Read a co-worker's day, week and timelines",
    })
    .first();
  await expect(readRow.getByText("Anyone", { exact: true })).toBeVisible();

  const reorderRow = page
    .locator("div")
    .filter({ hasText: "Reorder my buckets" })
    .first();
  await expect(reorderRow.getByText("Manager", { exact: true })).toBeVisible();
});
