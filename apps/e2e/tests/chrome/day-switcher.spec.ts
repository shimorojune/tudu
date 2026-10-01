import { expect, test } from "@playwright/test";
import { ensureTodayDayTab } from "../../helpers/day-navigation.js";

test.describe("Day switcher in Today tab", () => {
  test("steps to tomorrow and back to today", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "DayTab day stepper is visible at xl (1280px)+; desktop project uses 1440px",
    );
    await ensureTodayDayTab(page);
    await expect(
      page.getByRole("button", { name: /Today, .*Pick a date/ }),
    ).toBeVisible();

    await page.getByLabel(/^Next day/).click();
    await expect(
      page.getByRole("button", { name: /Tomorrow, .*Pick a date/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to today" })).toBeVisible();

    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(
      page.getByRole("button", { name: /Today, .*Pick a date/ }),
    ).toBeVisible();
  });
});
