import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore, setSelectedDate } from "@tudu/store";
import { DayTab } from "./DayTab";

const locationState = vi.hoisted(() => ({
  pathname: "/",
  search: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  const Link = ({
    to,
    className,
    children,
  }: {
    to: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  );
  return {
    Link,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: typeof locationState }) => unknown;
    }) => select({ location: locationState }),
  };
});

vi.mock("@/hooks/useSpaceContext", () => ({
  useActiveOrgSlug: () => null,
}));

vi.mock("@tudu/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/shared")>();
  return {
    ...actual,
    effectiveDayIso: () => "2026-09-05",
  };
});

describe("DayTab", () => {
  it("shows the stepper on the active today route", async () => {
    locationState.pathname = "/";
    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-05"));

    render(
      <Provider store={store}>
        <DayTab to="/" exact />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: /Today/ })).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Next day/));
    expect(store.getState().day.selectedDate).toBe("2026-09-06");
  });

  it("renders a link when another tab is active", () => {
    locationState.pathname = "/week";
    const store = makeStore();
    store.dispatch(setSelectedDate("2026-09-05"));

    render(
      <Provider store={store}>
        <DayTab to="/" exact />
      </Provider>,
    );

    expect(screen.getByLabelText(/Previous day/)).toBeDisabled();
    expect(screen.getByLabelText(/Next day/)).toBeDisabled();
    expect(screen.getByRole("link", { name: /Today/ })).toBeInTheDocument();
  });
});
