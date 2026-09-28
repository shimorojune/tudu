import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { BottomNav } from "./BottomNav";

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
    "aria-label"?: string;
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
    const mergedClassName = [
      className,
      pathMatches && searchMatches ? activeProps?.className : null,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <a ref={ref} href={to} className={mergedClassName} {...props}>
        {children}
      </a>
    );
  });

  return { Link };
});

vi.mock("@/hooks/useSpaceContext", () => ({
  useActiveOrgSlug: () => null,
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetUnscheduledTasksQuery: () => ({
      data: { tasks: [{ id: "u1" }, { id: "u2" }, { id: "u3" }] },
    }),
  };
});

describe("BottomNav", () => {
  it("links to every main screen", () => {
    locationState.pathname = "/";
    locationState.search = {};

    render(
      <Provider store={makeStore()}>
        <BottomNav />
      </Provider>,
    );

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Today/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Week/ })).toHaveAttribute("href", "/week");
    expect(screen.getByRole("link", { name: /Requests/ })).toHaveAttribute(
      "href",
      "/requests",
    );
    expect(screen.getByRole("link", { name: /Unscheduled/ })).toHaveAttribute(
      "href",
      "/unscheduled",
    );
  });

  it("shows unscheduled count", () => {
    locationState.pathname = "/";
    locationState.search = {};

    render(
      <Provider store={makeStore()}>
        <BottomNav />
      </Provider>,
    );

    expect(screen.getByRole("link", { name: /Unscheduled/ }).textContent).toContain(
      "3",
    );
  });

  it("keeps Today active when task query params are present", () => {
    locationState.pathname = "/";
    locationState.search = {
      task: "11111111-1111-4111-8111-111111111111",
      tab: "comments",
    };

    render(
      <Provider store={makeStore()}>
        <BottomNav />
      </Provider>,
    );

    expect(screen.getByRole("link", { name: /Today/ })).toHaveClass("text-foreground");
  });
});
