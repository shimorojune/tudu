import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Task } from "@tudu/shared";
import { RolloverBanner } from "./RolloverBanner.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Task",
    scheduledDate: "2026-09-06",
    bucket: "now",
    position: 0,
    startDate: null,
    deadline: null,
    completedAt: null,
    carriedDays: 1,
    carriedSince: "2026-09-05",
    isPrivate: false,
    createdAt: "2026-09-06T08:00:00.000Z",
    updatedAt: "2026-09-06T08:00:00.000Z",
    commentCount: 0,
    subtasks: [],
    ...overrides,
  };
}

describe("RolloverBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows recap when tasks were carried", () => {
    render(
      <RolloverBanner
        tasks={[task(), task({ id: "22222222-2222-4222-8222-222222222222", bucket: "later", carriedDays: 0 })]}
        effectiveDay="2026-09-06"
        onPushAllToLater={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("came with you from yesterday");
  });

  it("shows push button when now is over cap", async () => {
    const onPush = vi.fn();
    const tasks = [
      task({ id: "11111111-1111-4111-8111-111111111111", position: 0 }),
      task({ id: "22222222-2222-4222-8222-222222222222", position: 1 }),
      task({ id: "33333333-3333-4333-8333-333333333333", position: 2 }),
      task({ id: "44444444-4444-4444-8444-444444444444", position: 3 }),
      task({ id: "55555555-5555-4555-8555-555555555555", position: 4 }),
      task({ id: "66666666-6666-4666-8666-666666666666", position: 5 }),
    ];

    render(
      <RolloverBanner
        tasks={tasks}
        effectiveDay="2026-09-06"
        nowSoftCap={5}
        onPushAllToLater={onPush}
        onDismiss={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Push all to Later" }));
    expect(onPush).toHaveBeenCalled();
  });
});
