import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "@tudu/shared";
import { COMPLETED_SECTION_STORAGE_KEY } from "@/lib/completedTasks";
import { CompletedSection } from "./CompletedSection";

vi.mock("@/hooks/useProjectFilterId", () => ({
  useProjectFilterId: () => undefined,
}));

function makeTask(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    description: null,
    scheduledDate: "2026-09-06",
    bucket: "later",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: "2026-09-06T10:00:00.000Z",
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: false,
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:00:00.000Z",
    subtasks: [],
    commentCount: 0,
    project: null,
    jiraLinks: [],
    ...overrides,
  };
}

describe("CompletedSection", () => {
  it("renders nothing when there are no completed tasks", () => {
    const { container } = render(
      <CompletedSection
        tasks={[]}
        selectedTaskId={null}
        selectedDate="2026-09-06"
        onSelectTask={() => {}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("starts collapsed and expands to show completed rows", async () => {
    window.localStorage.removeItem(COMPLETED_SECTION_STORAGE_KEY);
    const user = userEvent.setup();
    const task = makeTask({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Ship the fix",
    });

    render(
      <CompletedSection
        tasks={[task]}
        selectedTaskId={null}
        selectedDate="2026-09-06"
        onSelectTask={() => {}}
      />,
    );

    expect(screen.getByTestId("completed-section-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("completed-section-rows")).not.toBeInTheDocument();
    expect(screen.queryByText("Ship the fix")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("completed-section-toggle"));

    expect(screen.getByTestId("completed-section-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Ship the fix")).toBeInTheDocument();
  });
});
