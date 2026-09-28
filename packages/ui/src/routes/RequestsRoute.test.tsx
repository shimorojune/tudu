import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { RequestsRoute } from "./RequestsRoute";

vi.mock("@/hooks/useSpaceContext", () => ({
  useActiveOrgSlug: () => null,
}));

describe("RequestsRoute", () => {
  it("renders section headings", () => {
    const { getByRole } = renderWithProviders(<RequestsRoute />);
    expect(getByRole("heading", { name: "Requests" })).toBeInTheDocument();
    expect(getByRole("heading", { name: "Incoming" })).toBeInTheDocument();
    expect(getByRole("heading", { name: "Sent" })).toBeInTheDocument();
    expect(getByRole("heading", { name: "Recent outcomes" })).toBeInTheDocument();
  });
});
