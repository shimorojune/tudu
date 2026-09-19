import { expect, test } from "@playwright/test";

test.describe("New task start and deadline", () => {
  test("creates a task with start and deadline from the dialog", async ({
    page,
  }) => {
    await page.goto("/today");

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const title = `Start deadline ${Date.now()}`;
    await page.getByPlaceholder("What needs doing?").fill(title);
    await page.getByRole("button", { name: "Start date" }).click();
    await page.getByRole("gridcell", { name: "19" }).click();

    await page.getByRole("button", { name: "Pick a deadline" }).click();
    await page.getByRole("gridcell", { name: "20" }).click();

    await page.getByRole("button", { name: /add to/i }).click();

    await expect(page.getByText(title)).toBeVisible();
  });
});
