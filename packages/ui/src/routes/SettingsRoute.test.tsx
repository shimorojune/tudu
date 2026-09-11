import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { SettingsRoute } from "./SettingsRoute";

const navigate = vi.fn();
const signOutMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@/lib/signOut", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetMeQuery: () => ({
      data: {
        id: "user-1",
        email: "testuser@egain.com",
        name: "Test User",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      isLoading: false,
    }),
  };
});

describe("SettingsRoute", () => {
  it("shows the signed-in profile and sign out control", () => {
    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
    expect(screen.getAllByText("testuser@egain.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out and navigates to sign-in", async () => {
    signOutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: "/sign-in" });
  });

  it("shows a stub message for other settings sections", async () => {
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "General" }));

    expect(
      screen.getByText("This page is not in this version yet."),
    ).toBeInTheDocument();
  });
});
