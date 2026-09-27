import { expect, test } from "@playwright/test";

test.describe("New task start and deadline", () => {
  test("creates a task with start and deadline from the dialog", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL("/");

    await page.getByRole("button", { name: "New task" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const title = `Start deadline ${Date.now()}`;
    await page.getByPlaceholder("What needs doing?").fill(title);
    await page.getByRole("button", { name: "Start date" }).click();
    const startDay = new Date();
    startDay.setDate(startDay.getDate() + 1);
    await page
      .getByRole("gridcell", { name: String(startDay.getDate()), exact: true })
      .first()
      .click();

    await page.getByRole("button", { name: "Pick a deadline" }).click();
    const deadlineDay = new Date(startDay);
    deadlineDay.setDate(deadlineDay.getDate() + 1);
    await page
      .getByRole("gridcell", {
        name: String(deadlineDay.getDate()),
        exact: true,
      })
      .first()
      .click();

    await page.getByRole("button", { name: /add to/i }).click();

    await expect(page.getByText(title)).toBeVisible();
  });
});
