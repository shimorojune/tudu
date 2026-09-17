import { describe, expect, it, vi } from "vitest";
import { finalizeNewTaskDescriptionAttachments } from "./finalizeNewTaskDescriptionAttachments";

describe("finalizeNewTaskDescriptionAttachments", () => {
  it("replaces blob URLs with uploaded attachment URLs", async () => {
    const blobUrl = "blob:http://localhost/abc-123";
    const pending = new Map<string, File>([
      [blobUrl, new File(["x"], "photo.png", { type: "image/png" })],
    ]);
    const upload = vi.fn().mockResolvedValue({
      contentUrl: "/attachments/id/content",
      mimeType: "image/png",
      fileName: "photo.png",
    });

    const result = await finalizeNewTaskDescriptionAttachments(
      `<p><img src="${blobUrl}" alt="photo.png"></p>`,
      pending,
      upload,
    );

    expect(upload).toHaveBeenCalledOnce();
    expect(result).toBe(
      '<p><img src="/attachments/id/content" alt="photo.png"></p>',
    );
  });

  it("does not replace autolinked blob text outside href or src", async () => {
    const blobUrl = "blob:http://localhost/abc-123";
    const pending = new Map<string, File>([
      [blobUrl, new File(["x"], "photo.png", { type: "image/png" })],
    ]);
    const upload = vi.fn().mockResolvedValue({
      contentUrl: "/attachments/id/content",
      mimeType: "image/png",
      fileName: "photo.png",
    });

    const result = await finalizeNewTaskDescriptionAttachments(
      `<p><img src="${blobUrl}" alt="photo.png"></p><p><a href="${blobUrl}">${blobUrl}</a></p>`,
      pending,
      upload,
    );

    expect(result).toContain('<img src="/attachments/id/content"');
    expect(result).toContain('href="/attachments/id/content"');
    expect(result).toContain(">photo.png</a>");
    expect(result).not.toContain(blobUrl);
  });

  it("appends uploaded markup when blob src was stripped from saved html", async () => {
    const blobUrl = "blob:http://localhost/abc-123";
    const pending = new Map<string, File>([
      [blobUrl, new File(["x"], "photo.png", { type: "image/png" })],
    ]);
    const upload = vi.fn().mockResolvedValue({
      contentUrl: "/attachments/id/content",
      mimeType: "image/png",
      fileName: "photo.png",
    });

    const result = await finalizeNewTaskDescriptionAttachments(
      "<p></p>",
      pending,
      upload,
    );

    expect(result).toContain('<img src="/attachments/id/content"');
    expect(upload).toHaveBeenCalledOnce();
  });

  it("returns the original description when there are no pending files", async () => {
    const upload = vi.fn();
    const result = await finalizeNewTaskDescriptionAttachments(
      "<p>Hello</p>",
      new Map(),
      upload,
    );
    expect(result).toBe("<p>Hello</p>");
    expect(upload).not.toHaveBeenCalled();
  });
});
