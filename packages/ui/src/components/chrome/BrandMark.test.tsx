import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("renders the T mark and Tudu wordmark", () => {
    render(<BrandMark />);

    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText("Tudu")).toBeInTheDocument();
  });
});
