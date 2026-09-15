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
});
