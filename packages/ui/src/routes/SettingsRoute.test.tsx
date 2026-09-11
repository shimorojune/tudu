import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { APP_VERSION } from "@/lib/appVersion";
import { SettingsRoute } from "./SettingsRoute";

const navigate = vi.fn();
const signOutMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => ({}),
  Link: ({
    children,
    to,
  }: {
    children: ReactNode;
    to: string;
  }) => <a href={to}>{children}</a>,
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
    useGetProjectsQuery: () => ({ data: [], isLoading: false }),
    useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
    useUpdateProjectMutation: () => [vi.fn(), { isLoading: false }],
    useDeleteProjectMutation: () => [vi.fn(), { isLoading: false }],
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
    expect(screen.getByText(`Tudu ${APP_VERSION}`)).toBeInTheDocument();
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

  it("shows banner toggles on the notifications page", async () => {
    localStorage.clear();
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "Notifications and sync" }));

    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Inbox notifications" })).toBeInTheDocument();
  });

  it("shows the projects section", async () => {
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "Projects" }));

    expect(screen.getByLabelText("New project name")).toBeInTheDocument();
  });
});
