import { describe, expect, it } from "vitest";
import {
  emptyLinkPreview,
  isAllowedPreviewUrl,
  parseLinkPreviewHtml,
} from "./linkPreview.js";

describe("isAllowedPreviewUrl", () => {
  it("allows public https URLs", () => {
    expect(isAllowedPreviewUrl("https://beetle.egain.com/browse/ACTION-33440")).toBe(
      true,
    );
  });

  it("rejects javascript and file URLs", () => {
    expect(isAllowedPreviewUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedPreviewUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects localhost and private IPs", () => {
    expect(isAllowedPreviewUrl("http://localhost:3456/secret")).toBe(false);
    expect(isAllowedPreviewUrl("http://127.0.0.1/")).toBe(false);
    expect(isAllowedPreviewUrl("http://192.168.1.9/")).toBe(false);
    expect(isAllowedPreviewUrl("http://10.0.0.2/")).toBe(false);
    expect(isAllowedPreviewUrl("http://169.254.169.254/latest")).toBe(false);
  });
});

describe("parseLinkPreviewHtml", () => {
  it("reads Open Graph title, description, and image", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="ACTION-33440: Fix login">
          <meta property="og:description" content="Users cannot sign in after deploy">
          <meta property="og:image" content="https://cdn.example.com/card.png">
          <meta property="og:site_name" content="Jira">
          <title>Should lose to og:title</title>
        </head>
      </html>
    `;

    expect(
      parseLinkPreviewHtml(html, "https://beetle.egain.com/browse/ACTION-33440"),
    ).toEqual({
      url: "https://beetle.egain.com/browse/ACTION-33440",
      hostname: "beetle.egain.com",
      title: "ACTION-33440: Fix login",
      description: "Users cannot sign in after deploy",
      imageUrl: "https://cdn.example.com/card.png",
      siteName: "Jira",
    });
  });

  it("falls back to the document title and relative favicon", () => {
    const html = `
      <title>Log in to Jira</title>
      <link rel="icon" href="/favicon.ico">
    `;

    const preview = parseLinkPreviewHtml(html, "https://beetle.egain.com/login");
    expect(preview.title).toBe("Log in to Jira");
    expect(preview.imageUrl).toBe("https://beetle.egain.com/favicon.ico");
  });

  it("decodes HTML entities in og tags", () => {
    const html =
      '<meta property="og:title" content="Ship &amp; polish">';
    expect(parseLinkPreviewHtml(html, "https://example.com/a").title).toBe(
      "Ship & polish",
    );
  });
});

describe("emptyLinkPreview", () => {
  it("keeps the hostname when metadata is missing", () => {
    expect(emptyLinkPreview("https://example.com/path")).toMatchObject({
      hostname: "example.com",
      title: null,
      imageUrl: null,
    });
  });
});
