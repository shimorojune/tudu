import { expect, test } from "@playwright/test";
import { createOrgViaApi } from "../../helpers/orgs.js";

test("settings keeps org in the header after navigating from org today", async ({
  page,
  request,
}) => {
  const name = `Settings space ${Date.now().toString(36)}`;
  const { slug } = await createOrgViaApi(request, name);

  await page.goto(`/o/${slug}`);
  await expect(page.getByRole("button", { name: "Switch space" })).toContainText(
    name,
  );

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("button", { name: "Switch space" })).toContainText(
    name,
  );
  await expect(page.getByRole("link", { name: "Co-workers" })).toBeVisible();
});
