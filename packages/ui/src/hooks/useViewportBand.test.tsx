import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportBand } from "./useViewportBand";

function stubWidth(width: number) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
    })),
  );
  return listeners;
}

describe("useViewportBand", () => {
  beforeEach(() => {
    stubWidth(1280);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the current window width on first render", () => {
    stubWidth(390);
    const { result } = renderHook(() => useViewportBand());
    expect(result.current).toBe("phone");
  });

  it("updates when a breakpoint media query changes", () => {
    const listeners = stubWidth(1024);
    const { result } = renderHook(() => useViewportBand());
    expect(result.current).toBe("tablet");

    vi.stubGlobal("innerWidth", 1440);
    act(() => {
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current).toBe("desktop");
  });
});
