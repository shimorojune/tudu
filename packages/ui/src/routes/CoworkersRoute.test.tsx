import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { screen } from "@testing-library/react";
import { CoworkersRoute } from "./CoworkersRoute";
import { renderWithProviders } from "@/test/render";

const server = setupServer(
  http.get("http://localhost:3456/orgs/acme/coworkers*", () =>
    HttpResponse.json({
      orgName: "Acme",
      members: [
        {
          userId: "me",
          name: "Ana",
          email: "ana@egain.com",
          isSelf: true,
          nowCount: 1,
          openCount: 3,
          slippingCount: 0,
          nowTitle: "Draft runbook",
          lastSeenAt: "2026-09-27T10:00:00.000Z",
        },
        {
          userId: "peer",
          name: "Marcus",
          email: "marcus@egain.com",
          isSelf: false,
          nowCount: 0,
          openCount: 2,
          slippingCount: 1,
          nowTitle: null,
          lastSeenAt: "2026-09-26T18:40:00.000Z",
        },
      ],
    }),
  ),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useParams: () => ({ orgSlug: "acme" }),
    Link: ({
      children,
      to,
    }: {
      children: ReactNode;
      to: string;
    }) => <a href={to}>{children}</a>,
  };
});

describe("CoworkersRoute", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("lists self first with You label and slipping footnote", async () => {
    renderWithProviders(<CoworkersRoute />);

    expect(await screen.findByText("In Acme")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/now: Draft runbook/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open day" })).toBeInTheDocument();
    expect(
      screen.getByText(/Slipping = carried two days or more/),
    ).toBeInTheDocument();
  });
});
