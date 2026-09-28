import { describe, expect, it } from "vitest";
import {
  plainQuickAddNoteToDescriptionHtml,
  quickAddNoteAtLineCap,
  quickAddNoteLineCount,
} from "./quickAddNote.js";

describe("quickAddNote", () => {
  it("counts note lines and detects the cap", () => {
    expect(quickAddNoteLineCount("one")).toBe(1);
    expect(quickAddNoteLineCount("one\ntwo\nthree")).toBe(3);
    expect(quickAddNoteAtLineCap("one\ntwo\nthree")).toBe(true);
    expect(quickAddNoteAtLineCap("one\ntwo")).toBe(false);
  });

  it("converts plain note text to description html", () => {
    expect(plainQuickAddNoteToDescriptionHtml("Hello\nWorld")).toBe(
      "<p>Hello</p><p>World</p>",
    );
    expect(plainQuickAddNoteToDescriptionHtml("   ")).toBeNull();
  });
});
