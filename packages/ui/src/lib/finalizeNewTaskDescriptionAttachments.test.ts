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
