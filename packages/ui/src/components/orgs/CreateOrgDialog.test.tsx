import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateOrgDialog } from "./CreateOrgDialog";
import { renderWithProviders } from "@/test/render";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

const server = setupServer(
  http.post("http://localhost:3456/orgs", async () =>
    HttpResponse.json(
      {
        org: { id: "o1", slug: "acme", name: "Acme" },
        spaces: [],
      },
      { status: 201 },
    ),
  ),
);

describe("CreateOrgDialog", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("creates an organization", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CreateOrgDialog open onOpenChange={() => undefined} />,
    );

    await user.type(screen.getByPlaceholderText("Organization name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/o/$orgSlug",
      params: { orgSlug: "acme" },
    });
  });
});
