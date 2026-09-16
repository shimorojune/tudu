import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentContentPath,
  isAllowedAttachmentContentUrl,
} from "./attachments.js";

describe("attachments", () => {
  it("defines a 5MB limit", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("builds content paths", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(attachmentContentPath(id)).toBe(
      `/attachments/${id}/content`,
    );
  });

  it("allows attachment content urls", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(isAllowedAttachmentContentUrl(attachmentContentPath(id))).toBe(true);
    expect(
      isAllowedAttachmentContentUrl(
        `http://localhost:3456/attachments/${id}/content`,
      ),
    ).toBe(true);
    expect(isAllowedAttachmentContentUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedAttachmentContentUrl("data:text/plain,hi")).toBe(false);
  });
});
