import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { oauth2Consent } from "@/lib/authClient";
import { OAuthConsentRoute } from "./OAuthConsentRoute";

vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "u1" } },
      isPending: false,
    }),
  },
  oauth2Consent: vi.fn(),
}));

describe("OAuthConsentRoute", () => {
  it("renders scopes and allows consent", async () => {
    const user = userEvent.setup();
    vi.mocked(oauth2Consent).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { url: "https://client.example/callback" },
                error: null,
              }),
            50,
          );
        }),
    );
    window.history.replaceState(
      {},
      "",
      "/oauth/consent?client_id=test-client&scope=tasks%3Aread%20tasks%3Awrite&code=abc",
    );

    render(<OAuthConsentRoute />);

    expect(screen.getByRole("heading", { name: "Allow access" })).toBeTruthy();
    expect(screen.getByText("Read your tasks and spaces")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(
      await screen.findByRole("button", { name: "Allowing..." }),
    ).toBeTruthy();
    expect(vi.mocked(oauth2Consent)).toHaveBeenCalledWith({
      accept: true,
      oauth_query: expect.stringContaining("client_id=test-client"),
    });
  });
});
