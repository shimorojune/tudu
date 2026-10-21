import { expect, type Locator, type Page } from '@playwright/test';

/** The search panel (the sheet on phones). */
export function panel(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Search tasks' });
}

/** The box you type in. */
export function box(page: Page): Locator {
  return panel(page).getByRole('combobox', { name: 'Search tasks' });
}

/** Open search from the top bar's icon, or the Search tab on phones; the box is focused when it resolves. */
export async function openSearch(page: Page): Promise<void> {
  const tab = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Search' });
  const top = page.getByRole('button', { name: 'Search tasks' });
  // Right after a reload neither is drawn yet: wait for whichever this size has before choosing.
  await expect(tab.or(top).first()).toBeVisible();
  if (await tab.count()) await tab.click();
  else await top.click();
  await expect(box(page)).toBeFocused();
}

/** The rows in the list, task results only, by their titles. */
export async function hitTitles(page: Page): Promise<string[]> {
  return panel(page).locator('.tp-sh:not(.tp-sh-query):not(.tp-sh-create) .tp-sh-title').allTextContents();
}

/** Every row's words, recent searches and Create included. */
export function options(page: Page): Locator {
  return panel(page).getByRole('option');
}

/** The row for a task title. */
export function hit(page: Page, title: string): Locator {
  return panel(page).getByRole('option', {
    name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},`),
  });
}

/** Type words into the box and wait until the rows answer those very words (the list says which it answers). */
export async function search(page: Page, words: string): Promise<void> {
  await box(page).fill(words);
  await expect(panel(page).getByRole('listbox', { name: 'Matching tasks' })).toHaveAttribute(
    'data-answer',
    words.trim().toLowerCase(),
  );
}
