import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("pulses and stops when motion is reduced", () => {
    const { container } = render(<Skeleton />);
    const node = container.firstElementChild;

    expect(node).toHaveClass("animate-pulse", "bg-muted", "motion-reduce:animate-none");
    expect(node?.className).not.toMatch(/\brounded-/);
  });
});
