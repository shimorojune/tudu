import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { BottomNav } from "./BottomNav";

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
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetInboxCountQuery: () => ({ data: { count: 2 } }),
    useGetUnscheduledTasksQuery: () => ({
      data: { tasks: [{ id: "u1" }, { id: "u2" }, { id: "u3" }] },
    }),
  };
});

describe("BottomNav", () => {
  it("links to every main screen", () => {
    render(
      <Provider store={makeStore()}>
        <BottomNav />
      </Provider>,
    );

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Today/ })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Week/ })).toHaveAttribute("href", "/week");
    expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("href", "/inbox");
    expect(screen.getByRole("link", { name: /Unscheduled/ })).toHaveAttribute(
      "href",
      "/unscheduled",
    );
    expect(screen.getByRole("link", { name: /Team/ })).toHaveAttribute("href", "/team");
  });

  it("shows inbox badge and unscheduled count", () => {
    render(
      <Provider store={makeStore()}>
        <BottomNav />
      </Provider>,
    );

    expect(screen.getByRole("link", { name: /Inbox/ }).textContent).toContain("2");
    expect(screen.getByRole("link", { name: /Unscheduled/ }).textContent).toContain(
      "3",
    );
  });
});
