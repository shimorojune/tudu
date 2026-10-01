import { expect, test } from "@playwright/test";

test.describe("Rollover UI", () => {
  test("Today route renders without midnight error overlay", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  test("shows midnight banner between calendar midnight and day start", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const viewingDay = "2026-09-30";
    const calendarDay = "2026-10-01";
    const frozen = new Date(`${calendarDay}T02:30:00`);
    await page.clock.install({ time: frozen });
    await page.addInitScript((dismissKey) => {
      localStorage.removeItem(`tudu.rollover.dismissMidnight:${dismissKey}`);
      localStorage.removeItem("tudu.rollover.dayOverride");
    }, calendarDay);

    await page.goto(`/?date=${viewingDay}`);
    await page.waitForURL((url) => {
      if (url.pathname !== "/") {
        return false;
      }
      const date = url.searchParams.get("date");
      return date === viewingDay || date === null;
    });

    await expect(
      page.getByRole("button", { name: "Dismiss midnight banner" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/still on Wednesday/i)).toBeVisible();
  });
});
