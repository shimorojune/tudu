import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_WEB_URL } from "../../constants.js";
import {
  acceptInviteInBrowser,
  authDir,
  clearTestOutbox,
  createOrgViaApi,
  inviteMemberViaApi,
  uniqueOrgName,
  waitForLatestInviteToken,
} from "../../helpers/orgs.js";

const marcusAuth = path.join(authDir, "manager.json");
const priyaAuth = path.join(authDir, "priya.json");

test.describe("requests send and accept", () => {
  test("T4.18 marcus sends priya a task and priya accepts into Next", async ({
    browser,
  }) => {
    const marcusContext = await browser.newContext({
      storageState: marcusAuth,
    });
    const marcusRequest = marcusContext.request;
    await clearTestOutbox(marcusRequest);

    const orgName = uniqueOrgName("E2E Requests");
    const { slug, orgId } = await createOrgViaApi(marcusRequest, orgName);
    await inviteMemberViaApi(marcusRequest, slug, "priya@egain.com");

    const token = await waitForLatestInviteToken(marcusRequest, "priya@egain.com");
    await acceptInviteInBrowser(browser, priyaAuth, token, E2E_WEB_URL);

    const marcusPage = await marcusContext.newPage();
    await marcusPage.goto(`/o/${slug}/coworkers`);
    await marcusPage.getByRole("link", { name: "Open day" }).first().click();
    await marcusPage.getByRole("button", { name: "Send a task" }).click();
    const taskTitle = `E2E request ${Date.now().toString(36)}`;
    await marcusPage
      .getByRole("dialog")
      .getByRole("combobox")
      .selectOption({ label: "Priya Raman" });
    await marcusPage.getByLabel("Title").fill(taskTitle);
    await marcusPage.getByRole("button", { name: "Send request" }).click();

    const priyaContext = await browser.newContext({ storageState: priyaAuth });
    const priyaPage = await priyaContext.newPage();
    await priyaPage.goto(`/o/${slug}/requests`);
    await expect(priyaPage.getByText(taskTitle)).toBeVisible();
    await priyaPage.getByRole("button", { name: "Accept into Next" }).click();
    await expect(priyaPage.getByText(/Accepted|Recent outcomes/i)).toBeVisible({
      timeout: 15_000,
    });

    await marcusContext.close();
    await priyaContext.close();
    expect(orgId).toBeTruthy();
  });
});
