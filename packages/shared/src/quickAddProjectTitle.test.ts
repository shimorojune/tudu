import { describe, expect, it } from "vitest";
import { stripProjectPhraseFromTitle } from "./quickAddProjectTitle.js";

describe("stripProjectPhraseFromTitle", () => {
  it("removes a trailing project phrase", () => {
    expect(
      stripProjectPhraseFromTitle(
        "find out what is going on in the PS project",
        "PS",
      ),
    ).toBe("find out what is going on");
  });

  it("does not strip unrelated words", () => {
    expect(stripProjectPhraseFromTitle("pass the review", "PS")).toBe(
      "pass the review",
    );
  });

  it("returns trimmed title when project name is empty", () => {
    expect(stripProjectPhraseFromTitle("  Hello  ", "")).toBe("Hello");
  });
});
