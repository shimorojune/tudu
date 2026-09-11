import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { TopNav } from "./TopNav";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string; search: object } }) => unknown;
  }) => select({ location: { pathname: "/", search: {} } }),
}));

vi.mock("@/components/chrome/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ openPalette: vi.fn() }),
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetInboxCountQuery: () => ({ data: { count: 0 } }),
    useGetUnscheduledTasksQuery: () => ({ data: { tasks: [] } }),
    useGetProjectsQuery: () => ({ data: [] }),
    useGetMeQuery: () => ({ data: { id: "user-1" } }),
    useGetNotificationsQuery: () => ({
      data: { unreadCount: 0, notifications: [] },
    }),
    useReadNotificationMutation: () => [vi.fn(), { isLoading: false }],
    useReadAllNotificationsMutation: () => [vi.fn(), { isLoading: false }],
  };
});

describe("TopNav", () => {
  it("pads the header for the iOS status bar", () => {
    render(
      <Provider store={makeStore()}>
        <TopNav />
      </Provider>,
    );

    const header = screen.getByRole("banner");
    expect(header.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(header.className).toContain("h-[calc(56px+env(safe-area-inset-top))]");
  });
});
