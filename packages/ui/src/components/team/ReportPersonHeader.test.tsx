import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { ReportPersonHeader } from "./ReportPersonHeader";

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

describe("ReportPersonHeader", () => {
  it("links Day, Week, and Inbox for the report", () => {
    render(
      <Provider store={makeStore()}>
        <ReportPersonHeader
          userId="priya"
          name="Priya Raman"
          view="inbox"
          onSend={() => undefined}
        />
      </Provider>,
    );

    expect(screen.getByRole("link", { name: "Day" })).toHaveAttribute(
      "href",
      "/team/$userId",
    );
    expect(screen.getByRole("link", { name: "Week" })).toHaveAttribute(
      "href",
      "/team/$userId/week",
    );
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveAttribute(
      "href",
      "/team/$userId/inbox",
    );
    expect(screen.getByRole("button", { name: "Send a task" })).toBeInTheDocument();
  });
});
