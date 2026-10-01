import { expect, type Page } from "@playwright/test";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Matches app `effectiveDayIso` (day starts at 4:00). */
const DAY_START_HOUR = 4;

export function effectiveLocalTodayIso(): string {
  const d = new Date();
  if (d.getHours() < DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function shiftLocalIso(iso: string, days: number): string {
  const [y, m, day] = iso.split("-").map((part) => Number(part));
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export async function goToDate(page: Page, iso: string) {
  const pathname = new URL(page.url()).pathname;
  const base =
    pathname === "/" || pathname.endsWith("/today") ? "/" : pathname;
  await page.goto(`${base}?date=${iso}`);
  await page.waitForURL((url) => {
    const date = url.searchParams.get("date");
    if (date === iso) {
      return true;
    }
    return date === null && iso === effectiveLocalTodayIso();
  });
}

function commandsPaletteOpen(page: Page) {
  return page
    .getByPlaceholder("Search commands...")
    .or(page.locator('[data-slot="command-input"]'));
}

export async function dismissMidnightBannerIfVisible(page: Page) {
  const dismiss = page.getByRole("button", { name: "Dismiss midnight banner" });
  if (await dismiss.isVisible()) {
    await dismiss.click();
  }
}

/** Dismiss via the Commands header toggle so Esc does not close the task inspector sheet. */
export async function dismissCommandsIfOpen(page: Page) {
  const search = commandsPaletteOpen(page);
  if (!(await search.first().isVisible())) {
    return;
  }
  await page.getByRole("button", { name: "Commands" }).click();
  await expect(search.first()).toBeHidden({ timeout: 10_000 });
}

export async function ensureTodayDayTab(page: Page) {
  const today = effectiveLocalTodayIso();
  await page.goto(`/?date=${today}`);
  await page.waitForURL((url) => {
    if (url.pathname !== "/") {
      return false;
    }
    const date = url.searchParams.get("date");
    return date === today || date === null;
  });
  await dismissCommandsIfOpen(page);
  const todayTab = page.getByRole("button", { name: /Today, .*Pick a date/ });
  const backToToday = page.getByRole("button", { name: "Back to today" });
  await expect(async () => {
    if (await todayTab.isVisible()) {
      return;
    }
    await dismissCommandsIfOpen(page);
    if (await backToToday.isVisible()) {
      await backToToday.click();
    } else {
      await page.keyboard.press("ControlOrMeta+t");
    }
    if (await todayTab.isVisible()) {
      return;
    }
    throw new Error("Today day tab not ready");
  }).toPass({ timeout: 30_000 });
  await dismissCommandsIfOpen(page);
  await dismissMidnightBannerIfVisible(page);
}

/** Today tab with bucket labels Now / Next / Later (not Priority 1–3). */
export async function ensureTodayPage(page: Page, orgSlug?: string) {
  const today = effectiveLocalTodayIso();
  const path = orgSlug ? `/o/${orgSlug}` : "/";
  await page.goto(`${path}?date=${today}`);
  await page.waitForURL((url) => {
    if (url.pathname !== path) {
      return false;
    }
    const date = url.searchParams.get("date");
    return date === today || date === null;
  });
  await dismissMidnightBannerIfVisible(page);
  await dismissCommandsIfOpen(page);
  await expect(
    page.locator("section").filter({
      has: page.locator("header").getByText("Later", { exact: true }),
    }),
  ).toBeVisible({ timeout: 15_000 });
  const backToToday = page.getByRole("button", { name: "Back to today" });
  if (await backToToday.isVisible()) {
    await backToToday.click();
    await page.waitForURL((url) => {
      if (url.pathname !== path) {
        return false;
      }
      const date = url.searchParams.get("date");
      return date === today || date === null;
    });
  }
  const todayDayTab = page.getByRole("button", {
    name: /Today, .*Pick a date/,
  });
  if (await todayDayTab.isVisible()) {
    await expect(todayDayTab).toBeVisible();
  }
  await dismissCommandsIfOpen(page);
  await dismissMidnightBannerIfVisible(page);
}

export async function shiftDay(page: Page, delta: number) {
  if (delta === 0) {
    return;
  }
  const label = delta < 0 ? /^Previous day/ : /^Next day/;
  const stepper = page.getByLabel(label);
  if (await stepper.isVisible()) {
    for (let i = 0; i < Math.abs(delta); i += 1) {
      await stepper.click();
    }
    return;
  }
  const today = effectiveLocalTodayIso();
  await goToDate(page, shiftLocalIso(today, delta));
}

export async function goToYesterday(page: Page) {
  await shiftDay(page, -1);
  await expect(
    page.locator("section").filter({
      has: page.locator("header").getByText("Priority 1", { exact: true }),
    }),
  ).toBeVisible({ timeout: 15_000 });
}

export async function goToTomorrow(page: Page) {
  await shiftDay(page, 1);
}

function commandPaletteSearch(page: Page) {
  return page
    .getByPlaceholder("Search commands...")
    .or(page.locator('[data-slot="command-input"]'));
}

export async function openCommandPalette(page: Page) {
  const search = commandPaletteSearch(page);
  if (await search.first().isVisible()) {
    return;
  }
  await page.getByRole("button", { name: "Commands" }).click();
  if (await search.first().isVisible()) {
    return;
  }
  await page.keyboard.press("ControlOrMeta+k");
  await expect(search.first()).toBeVisible();
}

export async function runPaletteCommand(page: Page, name: string) {
  await openCommandPalette(page);
  const input = commandPaletteSearch(page).first();
  await input.fill(name);
  await expect(page.getByRole("option", { name })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(input).toBeHidden({ timeout: 15_000 });
}
