import type { Page } from '@playwright/test';
import { expect, signInFresh, test } from '../../fixtures/app';

const phone = () => test.info().project.name === 'phone';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });

test.describe('working hours', () => {
  test('WH-E01 Settings › Working hours: days and hours kept after a reload; Nudges is the one line; an end before the start is refused', async ({
    page,
  }) => {
    test.skip(phone(), 'the dialog');
    await signInFresh(page);
    await page.goto('/me?settings=hours');
    const d = dialog(page);
    await expect(d.getByRole('heading', { level: 1 })).toHaveText('Working hours');
    await expect(
      d.getByText('Nudges come from the Tudu app on a Mac. Your hours here are the ones it uses.'),
    ).toBeVisible();
    await expect(d.getByRole('switch', { name: 'Nudge me in my hours' })).toHaveCount(0);

    const saved = page.waitForResponse((r) => r.url().endsWith('/api/me/hours') && r.ok());
    await d.getByRole('button', { name: 'Saturday' }).click();
    await saved;
    const end = d.getByRole('textbox', { name: 'Every day ends at' });
    const again = page.waitForResponse((r) => r.url().endsWith('/api/me/hours') && r.ok());
    await end.fill('1730');
    await end.press('Enter');
    await again;

    await page.reload();
    await expect(d.getByRole('button', { name: 'Saturday' })).toHaveAttribute('aria-pressed', 'true');
    await expect(d.getByRole('textbox', { name: 'Every day ends at' })).toHaveValue('17:30');

    const start = d.getByRole('textbox', { name: 'Every day starts at' });
    await start.fill('19:00');
    await start.press('Enter');
    await expect(d.getByText('The end needs to be after the start.')).toBeVisible();
    await page.reload();
    await expect(d.getByRole('textbox', { name: 'Every day starts at' })).toHaveValue('09:00');
  });

  test('WH-E02 phone: Settings › Working hours pushes in; the times are 24-hour fields; no per-day link', async ({
    page,
  }) => {
    test.skip(!phone(), 'phone only');
    await signInFresh(page);
    await page.goto('/me/settings');
    // The list carries the hours line under the row (the dialog's nav has no sub-lines).
    const row = page
      .getByRole('navigation', { name: 'Settings' })
      .getByRole('button', { name: /^Working hours/ });
    await expect(row).toContainText('Mon to Fri, 09:00 to 18:00');
    await row.click();
    await expect(page).toHaveURL(/\/me\/settings\/hours$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Working hours');
    const start = page.getByRole('textbox', { name: 'Every day starts at' });
    await expect(start).toHaveAttribute('inputmode', 'numeric');
    await expect(start).toHaveValue('09:00');
    await expect(page.getByRole('button', { name: 'Set hours per day' })).toHaveCount(0);
  });
});
