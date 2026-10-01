import { expect, test } from "@playwright/test";
import {
  dismissCommandsIfOpen,
  runPaletteCommand,
} from "../../helpers/day-navigation.js";

test.describe("Project route", () => {
  test("opens a seeded project from the command palette", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.pathname === "/");
    await dismissCommandsIfOpen(page);
    await runPaletteCommand(page, "Open project EGS");
    await expect(page).toHaveURL(/\/projects\//);
    await expect(page.getByText("Ship EGS capacity notes")).toBeVisible();
  });
});
