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
import {
  expandCompletedSection,
  markTaskComplete,
  taskRow,
} from "../../helpers/completed-section";

const managerAuth = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.auth/manager.json",
);

let sharedAttachmentTitle = "";

test.describe.configure({ mode: "serial" });

test.describe("Task description attachments", () => {
  test("Today: attach image via toolbar and persist after reselect", async ({
    page,
  }) => {
    const title = uniqueAttachmentTitle("Attach today");
    sharedAttachmentTitle = title;
    await createTodayTask(page, title);

    await attachFileViaToolbar(page, tinyPngPath);
    await waitForDescriptionImage(page);
    await blurDescriptionToSave(page, title);

    await page.getByRole("button", { name: "Close inspector" }).click();
    await selectTaskByTitle(page, title);
    await waitForDescriptionImage(page);
  });

  test("Unscheduled: attach image and persist", async ({ page }) => {
    const title = uniqueAttachmentTitle("Attach unscheduled");
    await createUnscheduledTask(page, title);
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
    await expect(editor.getByRole("link", { name: "notes.txt" })).toBeVisible({
      timeout: 20_000,
    });
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
    await page.getByRole("button", { name: "Close inspector" }).click();
    await createTodayTask(page, plain);
    await page.getByRole("button", { name: "Close inspector" }).click();
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
  test.use({ storageState: managerAuth });

  test("manager sees report attachment read-only", async ({ page }) => {
    test.skip(!sharedAttachmentTitle, "Requires serial user attachment task");

    await page.goto("/team");
    await page.waitForURL("/team");
    await dismissBlockingOverlays(page);
    await page.getByRole("link", { name: "Open day" }).first().click();
    await page.waitForURL(/\/team\/[^/]+/);

    await selectTaskByTitle(page, sharedAttachmentTitle);
    await waitForDescriptionImage(page);
    await expect(
      descriptionEditor(page).getByRole("button", { name: "Attach file" }),
    ).toHaveCount(0);
  });
});
