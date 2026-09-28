import { expect, test } from "@playwright/test";

async function assertPhaseVProbes(page: import("@playwright/test").Page) {
  const badRadius = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const element of document.querySelectorAll("*")) {
      const radius = getComputedStyle(element).borderRadius;
      if (radius && radius !== "0px" && radius !== "0") {
        offenders.push(
          `${element.tagName.toLowerCase()}.${element.className}=${radius}`,
        );
        if (offenders.length >= 5) {
          break;
        }
      }
    }
    return offenders;
  });
  expect(badRadius, "non-zero border-radius").toEqual([]);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/\u2014/);
  expect(bodyText).not.toMatch(/\bundefined\b/);
}

test.describe("Phase V smoke probes", () => {
  test("Today and Requests pass layout probes", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await assertPhaseVProbes(page);

    await page.goto("/requests");
    await expect(page.locator("main")).toBeVisible();
    await assertPhaseVProbes(page);
  });
});
