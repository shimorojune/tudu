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
import { screen, waitFor } from "@testing-library/react";
import { MoveToSpaceDialog } from "./MoveToSpaceDialog";
import { renderWithProviders } from "@/test/render";

const server = setupServer(
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
);

describe("MoveToSpaceDialog", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("T5.3 lists org spaces and shows co-worker count copy", async () => {
    renderWithProviders(
      <MoveToSpaceDialog
        open
        onOpenChange={() => {}}
        taskId="11111111-1111-4111-8111-111111111111"
        taskTitle="Move me"
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: /Move to a space/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/co-workers will be able to read this task/)).toBeInTheDocument();
    });
    expect(screen.getByText(/cannot come back to Personal/)).toBeInTheDocument();
  });
});
