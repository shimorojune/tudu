import { expect, test } from "@playwright/test";
import {
  addTaskInBucket,
  ensureTaskListInteractive,
  rowCenterY,
  taskRow,
} from "../../helpers/completed-section.js";
import { ensureTodayPage } from "../../helpers/day-navigation.js";

test.describe("Drag reorder", () => {
  test("reorders tasks within a bucket via drag handle", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "drag reorder order is verified on desktop layout",
    );
    const first = `Drag A ${Date.now()}`;
    const second = `Drag B ${Date.now()}`;
    await ensureTodayPage(page);
    await ensureTaskListInteractive(page);
    await addTaskInBucket(page, "Later", first);
    await addTaskInBucket(page, "Later", second);

    const firstRow = taskRow(page, first);
    const secondRow = taskRow(page, second);
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();

    const firstYBefore = await rowCenterY(page, first);
    const secondYBefore = await rowCenterY(page, second);
    expect(firstYBefore).toBeLessThan(secondYBefore);

    await firstRow.hover();
    const handle = firstRow.locator(".cursor-grab").first();
    await handle.dragTo(secondRow);

    await expect(async () => {
      const firstYAfter = await rowCenterY(page, first);
      const secondYAfter = await rowCenterY(page, second);
      expect(firstYAfter).toBeGreaterThan(secondYAfter);
    }).toPass({ timeout: 10_000 });
  });
});
