import { expect, test } from "@playwright/test";
import {
  addUnscheduledTask,
  taskRow,
} from "../../helpers/completed-section.js";

test.describe("unscheduled inspector layout", () => {
  test("uses a side inspector on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "phone", "Phone uses a sheet inspector");

    await page.goto("/unscheduled");
    await page.waitForURL("/unscheduled");

    const title = `E2E unscheduled inspector ${Date.now()}`;
    await addUnscheduledTask(page, title);
    await expect(taskRow(page, title)).toBeVisible();
    await taskRow(page, title).click();

    await expect(page.getByRole("button", { name: "Details" })).toBeVisible();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toHaveCount(0);
  });

  test("opens a sheet inspector on phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "Sheet only on phone");

    await page.goto("/unscheduled");
    await page.waitForURL("/unscheduled");

    const title = `E2E unscheduled phone ${Date.now()}`;
    await addUnscheduledTask(page, title);
    await expect(page.locator('[data-slot="sheet-content"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  });
});
