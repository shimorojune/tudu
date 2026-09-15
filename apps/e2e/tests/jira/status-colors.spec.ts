import { expect, test } from "@playwright/test";
import { isJiraConnected } from "../../helpers/jira";

test.describe("Jira status colors @jira", () => {
  test.beforeEach(async ({ page }) => {
    if (!(await isJiraConnected(page))) {
      test.skip();
    }
    await page.goto("/");
    await page.waitForURL("/");
  });

  test("renders distinct lozenge colors for common statuses", async ({ page }) => {
    const badges = page.locator("article").locator("span").filter({ hasText: /.+/ });
    const count = await badges.count();
    if (count < 2) {
      test.skip();
    }

    const backgrounds = new Set<string>();
    for (let index = 0; index < Math.min(count, 8); index += 1) {
      const color = await badges.nth(index).evaluate((node) => {
        return window.getComputedStyle(node).backgroundColor;
      });
      backgrounds.add(color);
    }

    expect(backgrounds.size).toBeGreaterThan(1);
  });
});
