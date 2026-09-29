import { expect, type Page } from "@playwright/test";

function pad2(n: number) {
  return String(n).padStart(2, "0");
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
  await page.waitForURL((url) => url.searchParams.get("date") === iso);
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
  const today = localTodayIso();
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

export async function openCommandPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Commands" });
  if (await dialog.isVisible()) {
    return;
  }
  await page.getByRole("button", { name: "Commands" }).click();
  await expect(dialog).toBeVisible();
}

export async function runPaletteCommand(page: Page, name: string) {
  await openCommandPalette(page);
  await page.getByRole("option", { name }).click();
}
