import { describe, expect, it } from "vitest";
import {
  fixAttachmentAnchorLabels,
  replaceBlobUrlInDescriptionHtmlAttributes,
} from "./replaceBlobUrlsInDescriptionHtml";

describe("replaceBlobUrlsInDescriptionHtml", () => {
  const blobUrl = "blob:http://localhost/abc-123";
  const contentUrl = "/attachments/11111111-1111-1111-1111-111111111111/content";

  it("replaces blob URLs only in src and href attributes", () => {
    const html = `<p><img src="${blobUrl}" alt="x"></p><p>${blobUrl}</p>`;
    const next = replaceBlobUrlInDescriptionHtmlAttributes(
      html,
      blobUrl,
      contentUrl,
    );
    expect(next).toContain(`src="${contentUrl}"`);
    expect(next).toContain(`<p>${blobUrl}</p>`);
  });

  it("fixes anchor labels that still show the attachment path", () => {
    const html = `<p><a href="${contentUrl}">${contentUrl}</a></p>`;
    const next = fixAttachmentAnchorLabels(html, contentUrl, "notes.txt");
    expect(next).toContain('data-tudu-filename="notes.txt"');
    expect(next).toContain(">notes.txt</a>");
  });
});
