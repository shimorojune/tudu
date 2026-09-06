import { useRef, type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSlideOnReorder } from "./useSlideOnReorder";

function Harness({
  top,
  enabled,
  orderKey,
  children,
}: {
  top: number;
  enabled: boolean;
  orderKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useSlideOnReorder(ref, enabled, orderKey);
  return (
    <div
      ref={(node) => {
        ref.current = node;
        if (node) {
          Object.defineProperty(node, "offsetTop", {
            configurable: true,
            get: () => top,
          });
        }
      }}
      data-testid="row"
    >
      {children}
    </div>
  );
}

describe("useSlideOnReorder", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies a FLIP translate when orderKey and offsetTop change", () => {
    const { rerender } = render(
      <Harness top={0} enabled orderKey="now:0">
        first
      </Harness>,
    );

    rerender(
      <Harness top={40} enabled orderKey="now:1">
        first
      </Harness>,
    );

    expect(screen.getByTestId("row").style.transform).toContain("translate3d");
  });

  it("does not slide when only offsetTop changes", () => {
    const { rerender } = render(
      <Harness top={0} enabled orderKey="now:0">
        first
      </Harness>,
    );

    rerender(
      <Harness top={40} enabled orderKey="now:0">
        first
      </Harness>,
    );

    expect(screen.getByTestId("row").style.transform).toBe("");
  });

  it("clears leftover transform when the row becomes the dragged one", async () => {
    const { rerender } = render(
      <Harness top={0} enabled orderKey="now:0">
        first
      </Harness>,
    );

    rerender(
      <Harness top={40} enabled orderKey="now:1">
        first
      </Harness>,
    );

    expect(screen.getByTestId("row").style.transform).toContain("translate3d");

    await act(async () => {
      rerender(
        <Harness top={40} enabled={false} orderKey="now:1">
          first
        </Harness>,
      );
    });

    expect(screen.getByTestId("row").style.transform).toBe("");
  });
});
