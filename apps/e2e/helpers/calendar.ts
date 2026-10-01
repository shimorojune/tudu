import { expect, type Page } from "@playwright/test";

/** Pick a day in the open date popover (DateField / DeadlineField). */
export async function pickIsoDateInOpenPopover(page: Page, iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const monthName = target.toLocaleString("en-US", { month: "long" });
  const popover = page
    .locator('[data-slot="popover-content"]')
    .filter({ has: page.locator('[data-slot="calendar"]') })
    .last();
  await expect(popover).toBeVisible();

  for (let i = 0; i < 24; i += 1) {
    const caption =
      (await popover.getByRole("status").first().textContent()) ??
      (await popover.locator("[class*='month_caption']").first().textContent());
    if (caption?.includes(monthName) && caption.includes(String(y))) {
      break;
    }
    const captionDate = caption ? Date.parse(`${caption} 1`) : Number.NaN;
    const targetMonth = Date.parse(`${monthName} 1, ${y}`);
    if (!Number.isNaN(captionDate) && !Number.isNaN(targetMonth)) {
      if (captionDate < targetMonth) {
        await popover.getByRole("button", { name: /next month/i }).click();
      } else {
        await popover.getByRole("button", { name: /previous month/i }).click();
      }
    } else {
      await popover.getByRole("button", { name: /next month/i }).click();
    }
  }

  const dataDay = target.toLocaleDateString();
  const byDataDay = popover.locator(`button[data-day="${dataDay}"]`);
  if ((await byDataDay.count()) > 0) {
    await byDataDay.click({ force: true });
    await page.keyboard.press("Escape");
    return;
  }

  await popover
    .getByRole("gridcell")
    .filter({ hasNot: page.locator("[data-outside=true]") })
    .getByRole("button", { name: String(d), exact: true })
    .click({ force: true });
  await page.keyboard.press("Escape");
}
