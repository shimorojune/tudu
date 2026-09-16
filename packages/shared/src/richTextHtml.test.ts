import { describe, expect, it } from "vitest";
import {
  plainTextToRichHtml,
  richTextToPlainPreview,
  sanitizeRichTextHtml,
} from "./richTextHtml.js";

describe("richTextHtml", () => {
  it("wraps legacy plain text in a paragraph", () => {
    expect(plainTextToRichHtml("Hello")).toBe("<p>Hello</p>");
  });

  it("strips script tags from stored html", () => {
    expect(sanitizeRichTextHtml('<p>Hi</p><script>alert(1)</script>')).toBe("<p>Hi</p>");
  });

  it("keeps supported Tiptap inline marks and text alignment", () => {
    expect(sanitizeRichTextHtml('<p style="text-align: center"><u>Hi</u></p>')).toBe(
      '<p style="text-align: center"><u>Hi</u></p>',
    );
  });

  it("builds plain previews from html", () => {
    expect(richTextToPlainPreview("<p><strong>Hello</strong> world</p>")).toBe(
      "Hello world",
    );
  });

  it("keeps attachment images and strips unsafe src", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const safe = `<p><img src="/attachments/${id}/content" alt="shot"></p>`;
    expect(sanitizeRichTextHtml(safe)).toBe(safe);
    expect(sanitizeRichTextHtml('<img src="data:image/png;base64,abc">')).toBe(
      "",
    );
  });

  it("keeps video with attachment src", () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const safe = `<video src="/attachments/${id}/content" controls></video>`;
    expect(sanitizeRichTextHtml(safe)).toContain("/attachments/");
    expect(sanitizeRichTextHtml(safe)).toContain("controls");
  });

  it("preview replaces images with a token", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(
      richTextToPlainPreview(`<p>Hi <img src="/attachments/${id}/content"></p>`),
    ).toBe("Hi [image]");
  });
});

