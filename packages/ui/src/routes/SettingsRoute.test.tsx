import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { defaultNotificationPreferences } from "@tudu/shared";
import { APP_VERSION } from "@/lib/appVersion";
import { SettingsRoute } from "./SettingsRoute";

const navigate = vi.fn();
const signOutMock = vi.fn();
const searchState = vi.hoisted(() => ({
  section: undefined as string | undefined,
}));
const connectJira = vi.hoisted(() => vi.fn());
const disconnectJira = vi.hoisted(() => vi.fn());
const updateJiraProjectKeys = vi.hoisted(() => vi.fn());
const refreshJiraComponents = vi.hoisted(() => vi.fn());
const mutationResult = vi.hoisted(() => ({
  unwrap: () => Promise.resolve({}),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => searchState,
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
    useGetJiraStatusRestQuery: () => ({
      data: {
        connection: {
          connected: false,
          baseUrl: null,
          displayName: null,
          email: null,
          projectKeys: [],
          updatedAt: null,
        },
      },
      isLoading: false,
      isError: false,
    }),
    useConnectJiraMutation: () => [connectJira, { isLoading: false }],
    useDisconnectJiraMutation: () => [disconnectJira, { isLoading: false }],
    useUpdateJiraProjectKeysMutation: () => [
      updateJiraProjectKeys,
      { isLoading: false },
    ],
    useRefreshJiraComponentsMutation: () => [
      refreshJiraComponents,
      { isLoading: false },
    ],
    useGetJiraComponentsRestQuery: () => ({
      data: { components: [] },
      isLoading: false,
    }),
    useGetNotificationSettingsQuery: () => ({
      data: {
        ...defaultNotificationPreferences(),
        lastActiveAt: null,
        lastJiraPollAt: null,
        clientAppVersion: null,
      },
      isLoading: false,
    }),
    useUpdateNotificationSettingsMutation: () => [vi.fn()],
  };
});

describe("SettingsRoute", () => {
  beforeEach(() => {
    searchState.section = undefined;
    connectJira.mockReset();
    disconnectJira.mockReset();
    updateJiraProjectKeys.mockReset();
    refreshJiraComponents.mockReset();
    connectJira.mockReturnValue(mutationResult);
    disconnectJira.mockReturnValue(mutationResult);
    updateJiraProjectKeys.mockReturnValue(mutationResult);
    refreshJiraComponents.mockReturnValue(mutationResult);
  });

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

  it("shows the general settings panel", async () => {
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "General" }));

    expect(
      screen.getByRole("heading", { name: "General", level: 1 }),
    ).toBeInTheDocument();
  });

  it("shows notification toggles on the notifications page", async () => {
    localStorage.clear();
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(screen.getByRole("switch", { name: "System alerts" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Event notifications" })).toBeInTheDocument();
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

  it("writes the selected settings section to the URL", async () => {
    const user = userEvent.setup();

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: "JIRA connection" }));

    expect(screen.getByRole("heading", { name: "JIRA connection" })).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith({
      to: "/settings",
      search: { section: "jira" },
    });
  });

  it("hydrates the Jira settings section from the URL search", () => {
    searchState.section = "jira";

    render(
      <Provider store={makeStore()}>
        <SettingsRoute />
      </Provider>,
    );

    expect(screen.getByRole("heading", { name: "JIRA connection" })).toBeInTheDocument();
    expect(screen.getByLabelText("Jira Data Center URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
  });
});
