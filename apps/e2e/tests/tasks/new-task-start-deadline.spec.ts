import { expect, test } from "@playwright/test";
import { pickIsoDateInOpenPopover } from "../../helpers/calendar.js";
import {
  dismissCommandsIfOpen,
  effectiveLocalTodayIso,
  ensureTodayPage,
  shiftLocalIso,
} from "../../helpers/day-navigation.js";
import { openNewTaskForBucket, taskRow } from "../../helpers/completed-section.js";

test.describe("New task start and deadline", () => {
  test("creates a task with start and deadline from the dialog", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await ensureTodayPage(page);

    const title = `Start deadline ${Date.now()}`;
    const dialog = await openNewTaskForBucket(page, "Later");
    await dialog.getByRole("button", { name: "Today", exact: true }).click();
    await dialog.getByRole("button", { name: "Later", exact: true }).click();
    await dialog.getByPlaceholder("What needs doing?").fill(title);

    await dialog.getByRole("button", { name: "Start date" }).click();
    await pickIsoDateInOpenPopover(page, effectiveLocalTodayIso());

    await dialog.getByRole("button", { name: "Pick a deadline" }).click({ force: true });
    await pickIsoDateInOpenPopover(page, shiftLocalIso(effectiveLocalTodayIso(), 2));

    await dismissCommandsIfOpen(page);
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });
    await dismissCommandsIfOpen(page);
    await expect(async () => {
      const row = taskRow(page, title);
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeVisible();
    }).toPass({ timeout: 30_000 });
  });
});
