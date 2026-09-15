import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ViewportBand } from "@/lib/viewport";
import { TodayPanelLayout } from "./TodayPanelLayout";

const band = vi.hoisted(() => ({ current: "desktop" as ViewportBand }));

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => band.current,
}));

function renderLayout() {
  return render(
    <TodayPanelLayout
      taskList={<div>Task list</div>}
      jiraColumn={<div>JIRA pane</div>}
      inspector={<div>Inspector pane</div>}
    />,
  );
}

describe("TodayPanelLayout", () => {
  it("hides JIRA and inspector columns on phone", () => {
    band.current = "phone";
    renderLayout();

    expect(screen.getByText("Task list")).toBeInTheDocument();
    expect(screen.queryByText("JIRA pane")).not.toBeInTheDocument();
    expect(screen.queryByText("Inspector pane")).not.toBeInTheDocument();
  });

  it("shows all three panes on tablet", () => {
    band.current = "tablet";
    renderLayout();

    expect(screen.getByText("Task list")).toBeInTheDocument();
    expect(screen.getByText("JIRA pane")).toBeInTheDocument();
    expect(screen.getByText("Inspector pane")).toBeInTheDocument();
  });

  it("shows all three panes on desktop", () => {
    band.current = "desktop";
    renderLayout();

    expect(screen.getByText("Task list")).toBeInTheDocument();
    expect(screen.getByText("JIRA pane")).toBeInTheDocument();
    expect(screen.getByText("Inspector pane")).toBeInTheDocument();
  });
});
