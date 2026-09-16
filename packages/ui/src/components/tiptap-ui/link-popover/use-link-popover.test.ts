import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useLinkHandler } from "./use-link-popover";

vi.mock("@/lib/attachmentUrl", () => ({
  isTaskAttachmentSrc: (src: string) => src.startsWith("/attachments/"),
  downloadAttachment: vi.fn(),
}));

describe("useLinkHandler openLink", () => {
  const openSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("open", openSpy);
    openSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens external links in a new tab", () => {
    const { result } = renderHook(() =>
      useLinkHandler({ editor: null }),
    );

    act(() => {
      result.current.setUrl("https://example.com/docs");
    });

    act(() => {
      result.current.openLink();
    });

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
