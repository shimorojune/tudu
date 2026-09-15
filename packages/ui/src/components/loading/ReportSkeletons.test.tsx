import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxSkeleton } from "./InboxSkeleton";
import { JiraIssueListSkeleton } from "./JiraSkeletons";
import { ReportDaySkeleton } from "./ReportDaySkeleton";

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => "desktop",
}));

describe("report loading skeletons", () => {
  it("keeps the desktop report day Jira pane reserved while loading", () => {
    const { container } = render(<ReportDaySkeleton />);

    expect(container.innerHTML).toContain(
      "grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(280px,396px)]",
    );
  });

  it("can reserve the desktop report inbox Jira pane while loading", () => {
    const { container } = render(<InboxSkeleton withJiraPane />);

    expect(container.innerHTML).toContain(
      "grid-cols-[minmax(0,1fr)_minmax(280px,360px)_minmax(280px,396px)]",
    );
  });

  it("renders issue-shaped Jira loading rows", () => {
    const { container } = render(<JiraIssueListSkeleton />);

    expect(container.querySelectorAll("[data-jira-issue-skeleton]")).toHaveLength(4);
  });
});
