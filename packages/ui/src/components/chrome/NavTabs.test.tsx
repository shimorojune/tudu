import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { effectiveDayIso } from "@tudu/shared";
import { describe, expect, it, vi } from "vitest";
import { makeStore, setSelectedDate } from "@tudu/store";
import { NavTabs } from "./NavTabs";

const locationState = vi.hoisted(() => ({
  pathname: "/",
  search: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");

  type LinkProps = {
    to: string;
    search?: Record<string, unknown>;
    activeOptions?: {
      exact?: boolean;
      includeSearch?: boolean;
    };
    activeProps?: { className?: string };
    className?: string;
    children: React.ReactNode;
  };

  function matchesSearch(
    current: Record<string, unknown>,
    target: Record<string, unknown>,
  ): boolean {
    const currentEntries = Object.entries(current);
    const targetEntries = Object.entries(target);
    if (currentEntries.length !== targetEntries.length) {
      return false;
    }
    return targetEntries.every(([key, value]) => current[key] === value);
  }

  function isPathMatch(to: string, exact: boolean | undefined): boolean {
    return exact
      ? locationState.pathname === to
      : to === "/"
        ? locationState.pathname === "/"
        : locationState.pathname === to || locationState.pathname.startsWith(`${to}/`);
  }

  const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
    { to, search, activeOptions, activeProps, className, children, ...props },
    ref,
  ) {
    const pathMatches = isPathMatch(to, activeOptions?.exact);
    const searchMatches =
      search === undefined ||
      activeOptions?.includeSearch === false ||
      matchesSearch(locationState.search, search);
    const mergedClassName = [className, pathMatches && searchMatches ? activeProps?.className : null]
      .filter(Boolean)
      .join(" ");

    return (
      <a ref={ref} href={to} className={mergedClassName} {...props}>
        {children}
      </a>
    );
  });

  return {
    Link,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: typeof locationState }) => unknown;
    }) =>
      select({
        location: locationState,
      }),
  };
});

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetInboxCountQuery: () => ({ data: { count: 0 } }),
    useGetUnscheduledTasksQuery: () => ({ data: { tasks: [] } }),
  };
});

describe("NavTabs", () => {
  it("labels the effective today after calendar midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 0, 38, 0));

    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-25"));

    render(
      <Provider store={store}>
        <NavTabs />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: /Today/ })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("keeps Today active when task query params are present", () => {
    locationState.pathname = "/";
    locationState.search = {
      task: "11111111-1111-4111-8111-111111111111",
      tab: "comments",
    };

    const store = makeStore();
    store.dispatch(setSelectedDate(effectiveDayIso()));

    render(
      <Provider store={store}>
        <NavTabs />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: /Today/ })).toBeInTheDocument();
  });
});
