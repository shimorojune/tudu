import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
  attachFileViaToolbar,
  blurDescriptionToSave,
  createTodayTask,
  createUnscheduledTask,
  descriptionEditor,
  dismissBlockingOverlays,
  notesTxtPath,
  selectTaskByTitle,
  tinyPngPath,
  uniqueAttachmentTitle,
  waitForDescriptionImage,
  writeOversizeFixture,
} from "../../helpers/attachments";
import { dismissCommandsIfOpen, effectiveLocalTodayIso, ensureTodayPage } from "../../helpers/day-navigation.js";
import {
  addTaskInBucket,
  expandCompletedSection,
  markTaskComplete,
  openNewTaskForBucket,
  taskRow,
} from "../../helpers/completed-section";
import {
  acceptInviteInBrowser,
  clearTestOutbox,
  createOrgViaApi,
  inviteMemberViaApi,
  uniqueOrgName,
  waitForLatestInviteToken,
} from "../../helpers/orgs";
import { E2E_SERVER_URL, E2E_WEB_URL } from "../../constants.js";
import { shiftLocalIso } from "../../helpers/day-navigation.js";

const managerAuth = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.auth/manager.json",
);

test.describe("Task description attachments", () => {
  test.describe.configure({ mode: "serial", timeout: 45_000 });

  test("Today: attach image via toolbar and persist after reselect", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const title = uniqueAttachmentTitle("E2E attach later");
    await createTodayTask(page, title);

    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await blurDescriptionToSave(page, title);

    await page.getByRole("button", { name: "Close inspector" }).click();
    await selectTaskByTitle(page, title);
    await waitForDescriptionImage(page);
  });

  test("Unscheduled: attach image and persist", async ({ page }) => {
    const title = uniqueAttachmentTitle("E2E attach backlog");
    await page.goto("/unscheduled");
    await page.waitForURL("/unscheduled");
    await createUnscheduledTask(page, title);
    await expect(taskRow(page, title)).toBeVisible({ timeout: 15_000 });
    await selectTaskByTitle(page, title);
    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await blurDescriptionToSave(page, title);

    await page.getByRole("button", { name: "Close inspector" }).click();
    await selectTaskByTitle(page, title);
    await waitForDescriptionImage(page);
  });

  test("attach generic file as download link", async ({ page }) => {
    const title = uniqueAttachmentTitle("Attach file");
    await createTodayTask(page, title);
    await attachFileViaToolbar(page, notesTxtPath);
    const editor = descriptionEditor(page);
    await expect(editor.getByRole("link", { name: "notes.txt" })).toBeVisible();
  });

  test("clicking a file attachment link downloads the file", async ({
    page,
  }) => {
    const title = uniqueAttachmentTitle("Attach download click");
    await createTodayTask(page, title);
    await attachFileViaToolbar(page, notesTxtPath);
    const editor = descriptionEditor(page);
    const link = editor.getByRole("link", { name: "notes.txt" });
    await expect(link).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("notes.txt");
  });

  test("new task: attach image before create keeps inline preview after save", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = uniqueAttachmentTitle("Attach new task");
    await openNewTaskForBucket(page, "Later");
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.locator('input[placeholder="What needs doing?"]').fill(title);

    const editor = dialog.getByTestId("rich-text-editor");
    const chooserPromise = page.waitForEvent("filechooser");
    await editor.getByRole("button", { name: "Attach file" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(tinyPngPath);
    await expect(editor.locator(".tudu-attachment-image img")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(dialog).not.toBeVisible();

    await selectTaskByTitle(page, title);
    await waitForDescriptionImage(page);
    await expect(
      descriptionEditor(page).getByRole("link", {
        name: /\/attachments\/.+\/content/,
      }),
    ).toHaveCount(0);
  });

  test("rejects files over 5MB", async ({ page }) => {
    const title = uniqueAttachmentTitle("Attach oversize");
    await createTodayTask(page, title);
    const oversizePath = await writeOversizeFixture();
    await attachFileViaToolbar(page, oversizePath);
    await expect(page.getByText(/too large|5MB/i)).toBeVisible();
    const editor = descriptionEditor(page);
    await expect(editor.locator(".tudu-attachment-image img")).toHaveCount(0);
  });

  test("bold text survives with an attachment", async ({ page }) => {
    const title = uniqueAttachmentTitle("Attach bold");
    await createTodayTask(page, title);
    const editor = descriptionEditor(page);
    await editor.getByRole("textbox", { name: "Task description" }).click();
    await page.keyboard.type("Bold line");
    await editor
      .getByTestId("tiptap-toolbar")
      .getByRole("button", { name: /bold/i })
      .click();
    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await blurDescriptionToSave(page, title);
    await page.getByRole("button", { name: "Close inspector" }).click();
    await selectTaskByTitle(page, title);
    await expect(editor.getByText("Bold line")).toBeVisible();
    await waitForDescriptionImage(page);
  });

  test("completed task shows attachment read-only without attach control", async ({
    page,
  }) => {
    const title = uniqueAttachmentTitle("Attach completed");
    await createTodayTask(page, title);
    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await blurDescriptionToSave(page, title);
    await page.getByRole("button", { name: "Close inspector" }).click();

    await markTaskComplete(page, title);
    await expandCompletedSection(page);
    await taskRow(page, title).click();
    await waitForDescriptionImage(page);
    await expect(
      descriptionEditor(page).getByRole("button", { name: "Attach file" }),
    ).toHaveCount(0);
  });

  test("switching tasks does not show stale attachment", async ({ page }) => {
    const withImage = uniqueAttachmentTitle("Attach A");
    const plain = uniqueAttachmentTitle("Attach B");
    await createTodayTask(page, withImage);
    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await dismissCommandsIfOpen(page);
    await page.getByRole("button", { name: "Close inspector" }).click();
    await addTaskInBucket(page, "Later", plain, { preserveCurrentDay: true });
    await selectTaskByTitle(page, withImage);
    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await selectTaskByTitle(page, plain);
    await expect(
      descriptionEditor(page).locator(".tudu-attachment-image img"),
    ).toHaveCount(0);
  });

  test("route smoke after attachments feature", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await page.goto("/unscheduled");
    await page.waitForURL("/unscheduled");
    await page.goto("/inbox");
    await page.waitForURL("/inbox");
    await page.goto("/week");
    await page.waitForURL("/week");
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});

test.describe("Manager report attachments", () => {
  test("manager sees report attachment read-only", async ({ browser }) => {
    test.setTimeout(90_000);
    const userAuth = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../.auth/user.json",
    );
    const reportTitle = uniqueAttachmentTitle("Manager attach");
    const userContext = await browser.newContext({ storageState: userAuth });
    const userRequest = userContext.request;
    const { slug, orgId } = await createOrgViaApi(
      userRequest,
      uniqueOrgName("E2E Manager attach"),
    );
    await clearTestOutbox(userRequest);
    await inviteMemberViaApi(userRequest, slug, "marcus@egain.com");
    const token = await waitForLatestInviteToken(userRequest, "marcus@egain.com");
    await acceptInviteInBrowser(browser, managerAuth, token, E2E_WEB_URL);

    const userPage = await userContext.newPage();
    const today = effectiveLocalTodayIso();
    const createRes = await userRequest.post(`${E2E_SERVER_URL}/tasks`, {
      data: {
        title: reportTitle,
        orgId,
        scheduledDate: today,
        bucket: "later",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    await userPage.goto(`/o/${slug}?date=${today}`);
    await userPage.waitForURL((url) => {
      if (url.pathname !== `/o/${slug}`) {
        return false;
      }
      const date = url.searchParams.get("date");
      return date === today || date === null;
    });
    await expect(taskRow(userPage, reportTitle)).toBeVisible({ timeout: 30_000 });
    await selectTaskByTitle(userPage, reportTitle);
    await attachFileViaToolbar(userPage, tinyPngPath);
    await waitForDescriptionImage(userPage);
    await blurDescriptionToSave(userPage, reportTitle);
    const membersRes = await userRequest.get(
      `${E2E_SERVER_URL}/orgs/${slug}/members`,
    );
    expect(membersRes.ok()).toBeTruthy();
    const { members } = (await membersRes.json()) as {
      members: Array<{ userId: string; email: string }>;
    };
    const owner = members.find((member) => member.email === "testuser@egain.com");
    expect(owner?.userId).toBeTruthy();
    await expect
      .poll(async () => {
        const dayRes = await userRequest.get(
          `${E2E_SERVER_URL}/orgs/${slug}/coworkers/${owner!.userId}/day?date=${today}`,
        );
        if (!dayRes.ok()) {
          return false;
        }
        const body = (await dayRes.json()) as {
          tasks: Array<{ title: string }>;
        };
        return body.tasks.some((task) => task.title === reportTitle);
      }, { timeout: 45_000 })
      .toBe(true);
    await userContext.close();

    const managerContext = await browser.newContext({
      storageState: managerAuth,
    });
    const page = await managerContext.newPage();
    await page.goto(`/o/${slug}/coworkers`);
    await dismissBlockingOverlays(page);
    const testUserRow = page
      .locator("div")
      .filter({ hasText: "Test User" })
      .filter({ has: page.getByRole("link", { name: "Open day" }) })
      .first();
    await testUserRow.getByRole("link", { name: "Open day" }).click();
    await page.waitForURL(new RegExp(`/o/${slug}/coworkers/[^/]+`));
    const coworkerDay = new URL(page.url());
    coworkerDay.searchParams.set("date", effectiveLocalTodayIso());
    const dayLoaded = page.waitForResponse(
      (response) =>
        response.url().includes("/coworkers/") &&
        response.url().includes("/day") &&
        response.ok(),
    );
    await page.goto(coworkerDay.toString());
    await dayLoaded;
    await dismissBlockingOverlays(page);
    await dismissCommandsIfOpen(page);

    const row = page.getByRole("button", { name: reportTitle, exact: true });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await expect(page.getByRole("button", { name: "Attach file" })).toHaveCount(
      0,
    );
    await managerContext.close();
  });
});
