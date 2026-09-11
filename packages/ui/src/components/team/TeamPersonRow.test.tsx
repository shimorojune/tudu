import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamPersonRow } from "./TeamPersonRow";

describe("TeamPersonRow", () => {
  it("keeps counts on the person block", () => {
    render(
      <TeamPersonRow
        name="Priya Raman"
        subtitle="now: Incorrect article version"
        showCounts
        nowCount={2}
        openCount={7}
        slippingCount={1}
      />,
    );

    expect(screen.getByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByText("now: Incorrect article version")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Slipping")).toBeInTheDocument();
  });

  it("omits counts for a pending invite", () => {
    render(
      <TeamPersonRow
        name="dana@egain.com"
        subtitle="Invite sent. Waiting for them to confirm."
      />,
    );

    expect(screen.queryByText("Now")).not.toBeInTheDocument();
  });
});
