import { expect, test } from "@playwright/test";
import { goToTomorrow } from "../../helpers/day-navigation.js";
import {
  addTaskInBucket,
  ensureTaskListInteractive,
  openTaskRowContextMenu,
  taskRow,
} from "../../helpers/completed-section";

test.describe("Move task to another day", () => {
  test("schedules a Today task for tomorrow from the context menu", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "row context menu scheduling is exercised on desktop layout",
    );
    const title = `E2E-move-day-${Date.now()}`;
    await page.goto("/");
    await page.waitForURL("/");
    await ensureTaskListInteractive(page);
    await addTaskInBucket(page, "Later", title);
    await expect(taskRow(page, title)).toBeVisible();

    await openTaskRowContextMenu(page, title);
    const scheduleItem = page.getByRole("menuitem", {
      name: "Schedule for tomorrow",
    });
    await expect(scheduleItem).toBeVisible();
    await scheduleItem.click();

    await goToTomorrow(page);
    await expect(taskRow(page, title)).toBeVisible({ timeout: 15_000 });
  });
});
