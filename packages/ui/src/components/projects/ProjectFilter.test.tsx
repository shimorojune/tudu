import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectFilter } from "./ProjectFilter";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string; search: Record<string, unknown> } }) => unknown }) =>
    select({ location: { pathname: "/", search: {} } }),
}));

vi.mock("react-redux", () => ({
  useSelector: () => "2026-09-15",
}));

vi.mock("@tudu/store", () => ({
  todayIso: () => "2026-09-15",
  useGetProjectsQuery: () => ({ data: [] }),
  useGetReportDayQuery: () => ({ data: undefined }),
  useGetReportProjectsQuery: () => ({ data: [] }),
}));

describe("ProjectFilter", () => {
  it("uses the standard rule border for the all-projects control", () => {
    render(<ProjectFilter />);

    expect(screen.getByRole("button", { name: "All projects" })).toHaveClass("border-rule");
    expect(screen.getByRole("button", { name: "All projects" })).not.toHaveClass("border-hair");
  });
});
