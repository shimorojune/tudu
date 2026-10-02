import { expect, test } from "@playwright/test";
import {
  dismissCommandsIfOpen,
  ensureTodayPage,
  runPaletteCommand,
} from "../../helpers/day-navigation.js";

test.describe("Project route", () => {
  test("opens a seeded project from the command palette", async ({ page }) => {
    await ensureTodayPage(page);
    await dismissCommandsIfOpen(page);
    await runPaletteCommand(page, "Open project EGS");
    await expect(page).toHaveURL(/\/projects\//, { timeout: 15_000 });
    await expect(page.getByText("Ship EGS capacity notes")).toBeVisible({
      timeout: 15_000,
    });
  });
});
