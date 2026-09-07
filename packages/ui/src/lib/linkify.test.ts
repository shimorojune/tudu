import { describe, expect, it } from "vitest";
import { linkHostname, linkifyText } from "./linkify.js";

describe("linkifyText", () => {
  it("leaves plain text alone", () => {
    expect(linkifyText("hello world")).toEqual([
      { kind: "text", value: "hello world" },
    ]);
  });

  it("splits http and https URLs", () => {
    expect(linkifyText("see https://example.com/path now")).toEqual([
      { kind: "text", value: "see " },
      {
        kind: "link",
        value: "https://example.com/path",
        href: "https://example.com/path",
      },
      { kind: "text", value: " now" },
    ]);
  });

  it("does not link bare domains", () => {
    expect(linkifyText("visit example.com")).toEqual([
      { kind: "text", value: "visit example.com" },
    ]);
  });

  it("rejects javascript URLs as plain text", () => {
    expect(linkifyText("bad javascript:alert(1)")).toEqual([
      { kind: "text", value: "bad javascript:alert(1)" },
    ]);
  });
});

describe("linkHostname", () => {
  it("returns the hostname", () => {
    expect(linkHostname("https://docs.example.com/page")).toBe("docs.example.com");
  });
});
