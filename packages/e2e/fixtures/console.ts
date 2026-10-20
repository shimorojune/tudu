import { test as base, expect } from '@playwright/test';

/** A test that fails if the page logs an error or an uncaught exception. */
export const test = base.extend<{ cleanConsole: string[] }>({
  cleanConsole: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
