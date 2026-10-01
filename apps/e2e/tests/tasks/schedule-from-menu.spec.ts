import { expect, test } from "@playwright/test";
import {
  addTaskInBucket,
  ensureTaskListInteractive,
  openTaskRowContextMenu,
  taskRow,
} from "../../helpers/completed-section.js";

test.describe("Schedule task dialog", () => {
  test("opens from day task context menu", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "row context menu scheduling is exercised on desktop layout",
    );
    const title = `E2E-schedule-dialog-${Date.now()}`;
    await page.goto("/");
    await page.waitForURL("/");
    await ensureTaskListInteractive(page);

    await addTaskInBucket(page, "Later", title);
    await expect(taskRow(page, title)).toBeVisible();

    await openTaskRowContextMenu(page, title);
    await page.getByRole("menuitem", { name: "Schedule…" }).click();

    await expect(page.getByRole("dialog", { name: "Schedule task" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Schedule task" })).toHaveCount(0);
  });
});
