import { expect, test } from "@playwright/test";
import {
  addTaskInBucket,
  ensureTaskListInteractive,
  taskRow,
} from "../../helpers/completed-section";

test.describe("Drag reorder", () => {
  test("reorders tasks within a bucket via drag handle", async ({ page }) => {
    const first = `Drag A ${Date.now()}`;
    const second = `Drag B ${Date.now()}`;
    await page.goto("/");
    await page.waitForURL("/");
    await ensureTaskListInteractive(page);
    await addTaskInBucket(page, "Later", first);
    await addTaskInBucket(page, "Later", second);

    const firstRow = taskRow(page, first);
    const secondRow = taskRow(page, second);
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    const handle = firstRow.getByRole("button", { name: "Drag to reorder" });
    await handle.dragTo(secondRow);
    await expect(taskRow(page, first)).toBeVisible();
  });
});
