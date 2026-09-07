import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CarryDots } from "./CarryDots.js";

function renderDots(props: ComponentProps<typeof CarryDots>) {
  return render(
    <TooltipProvider>
      <CarryDots {...props} />
    </TooltipProvider>,
  );
}

describe("CarryDots", () => {
  it("renders nothing visible when carriedDays is zero", () => {
    const { container } = renderDots({ carriedDays: 0 });
    expect(container.querySelector(".size-\\[5px\\]")).toBeNull();
  });

  it("caps at three dots", () => {
    const { container } = renderDots({ carriedDays: 5 });
    expect(container.querySelectorAll(".size-\\[5px\\]")).toHaveLength(3);
  });

  it("uses primary color when slipping", () => {
    const { container } = renderDots({ carriedDays: 2, slipping: true });
    expect(container.querySelector(".bg-primary")).not.toBeNull();
  });

  it("sets aria-label for carried days", () => {
    renderDots({ carriedDays: 2 });
    expect(screen.getByLabelText("Carried 2 days")).toBeInTheDocument();
  });

  it("sets slipping aria-label", () => {
    renderDots({ carriedDays: 3, slipping: true });
    expect(
      screen.getByLabelText("Carried 3 days, slipping"),
    ).toBeInTheDocument();
  });
});
