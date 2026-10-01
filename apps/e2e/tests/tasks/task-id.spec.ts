import { expect, test } from "@playwright/test";
import { createTodayTask } from "../../helpers/attachments.js";
import { ensureTodayPage } from "../../helpers/day-navigation.js";

test("task ID appears in the inspector details tab", async ({ page }) => {
  test.setTimeout(60_000);
  await ensureTodayPage(page);

  const title = `Task id probe ${Date.now()}`;
  await createTodayTask(page, title);

  const copyTaskId = page.getByRole("button", { name: "Copy task ID" });
  await expect(copyTaskId).toBeVisible({ timeout: 30_000 });
  await expect(copyTaskId.locator("xpath=..")).toHaveText(/^[A-Z]{2,5}-\d+$/);
});
