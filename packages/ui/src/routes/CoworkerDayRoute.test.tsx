import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
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
import userEvent from "@testing-library/user-event";
import { CoworkerDayRoute } from "./CoworkerDayRoute";
import { renderWithProviders } from "@/test/render";

const server = setupServer(
  http.get("http://localhost:3456/orgs/acme/coworkers/peer/day*", () =>
    HttpResponse.json({
      orgName: "Acme",
      userId: "peer",
      userName: "Marcus",
      scheduledDate: "2099-01-15",
      privateHiddenCount: 2,
      nowCount: 1,
      nowCap: 5,
      tasks: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          title: "Ship docs",
          bucket: "now",
          position: 0,
          completedAt: null,
          deadline: null,
          carriedDays: 0,
        },
      ],
    }),
  ),
  http.get("http://localhost:3456/orgs/acme/members", () =>
    HttpResponse.json({
      members: [
        {
          userId: "me",
          name: "Ana",
          email: "ana@egain.com",
          role: "owner",
          joinedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          userId: "peer",
          name: "Marcus",
          email: "marcus@egain.com",
          role: "member",
          joinedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    }),
  ),
  http.get("http://localhost:3456/orgs", () =>
    HttpResponse.json({
      spaces: [
        {
          kind: "org",
          orgId: "22222222-2222-4222-8222-222222222222",
          slug: "acme",
          name: "Acme",
          color: "cobalt",
          role: "owner",
        },
      ],
    }),
  ),
  http.get("http://localhost:3456/me", () =>
    HttpResponse.json({
      id: "me",
      email: "ana@egain.com",
      name: "Ana",
      createdAt: "2026-01-01T00:00:00.000Z",
      onboardedAt: "2026-01-01T00:00:00.000Z",
    }),
  ),
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useParams: () => ({ orgSlug: "acme", userId: "peer" }),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => "desktop",
}));

describe("CoworkerDayRoute", () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("T3.5 shows read-only copy, bucket cap, private footer, and proposal action", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoworkerDayRoute />);

    expect(
      await screen.findByText(/Read-only\. Changes you make are sent to Marcus/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Now \(1 \/ 5\)/)).toBeInTheDocument();
    expect(screen.getByText("2 private tasks hidden")).toBeInTheDocument();
    expect(screen.getByText("Ship docs")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Propose retitle" }));
    expect(
      screen.getByRole("dialog", { name: /Propose a change to/ }),
    ).toBeInTheDocument();
  });
});
