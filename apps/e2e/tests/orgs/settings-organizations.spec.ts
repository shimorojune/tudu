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

  const readLabel = page.getByText(
    "Read a co-worker's day, week and timelines",
    { exact: true },
  );
  await expect(
    readLabel.locator("xpath=..").getByText("Anyone", { exact: true }),
  ).toBeVisible();

  const reorderLabel = page.getByText("Reorder my buckets", { exact: true });
  await expect(
    reorderLabel.locator("xpath=..").getByText("Manager", { exact: true }),
  ).toBeVisible();
});
