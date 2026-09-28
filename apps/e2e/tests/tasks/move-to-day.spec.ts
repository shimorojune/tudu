import { expect, test } from "@playwright/test";
import { goToTomorrow } from "../../helpers/day-navigation.js";
import {
  addTaskInBucket,
  ensureTaskListInteractive,
  taskRow,
} from "../../helpers/completed-section";

test.describe("Move task to another day", () => {
  test("schedules a Today task for tomorrow from the context menu", async ({
    page,
  }) => {
    const title = `Move tmr ${Date.now()}`;
    await page.goto("/");
    await page.waitForURL("/");
    await ensureTaskListInteractive(page);
    await addTaskInBucket(page, "Later", title);
    await expect(taskRow(page, title)).toBeVisible();

    await taskRow(page, title).click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Schedule for tomorrow" })
      .click();

    await goToTomorrow(page);
    await expect(taskRow(page, title)).toBeVisible({ timeout: 15_000 });
  });
});
