import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpaceSwitcher } from "./SpaceSwitcher";
import { renderWithProviders } from "@/test/render";

const server = setupServer(
  http.get("http://localhost:3456/orgs", () =>
    HttpResponse.json({
      spaces: [
        { kind: "personal", name: "Personal", taskCount: 1 },
        {
          kind: "org",
          name: "Solo Org",
          slug: "solo",
          orgId: "org-solo",
          color: "cobalt",
          role: "owner",
          memberCount: 1,
        },
        {
          kind: "org",
          name: "Acme",
          slug: "acme",
          orgId: "org-1",
          color: "cobalt",
          role: "owner",
          memberCount: 3,
        },
      ],
    }),
  ),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
      select({ location: { pathname: "/" } }),
    Link: ({
      children,
      to,
    }: {
      children: ReactNode;
      to: string;
    }) => <a href={to}>{children}</a>,
  };
});

describe("SpaceSwitcher", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("lists spaces and opens create organization dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SpaceSwitcher />);

    await user.click(screen.getByRole("button", { name: "Switch space" }));
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Organization · 1 person")).toBeInTheDocument();
    expect(screen.getByText("Organization · 3 people")).toBeInTheDocument();
    expect(screen.getByText(/Alt\+1|Ctrl\+1/)).toBeInTheDocument();
    expect(screen.getByText(/Alt\+2|Ctrl\+2/)).toBeInTheDocument();
    await user.click(screen.getByText("New organization"));
    expect(screen.getByRole("dialog", { name: "New organization" })).toBeInTheDocument();
  });
});
