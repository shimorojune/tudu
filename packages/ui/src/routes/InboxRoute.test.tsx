import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InboxPendingItem } from "@tudu/shared";
import { InboxRoute } from "./InboxRoute";

const acceptInbox = vi.hoisted(() => vi.fn());
const declineInbox = vi.hoisted(() => vi.fn());
const deleteTask = vi.hoisted(() => vi.fn());

const pending: InboxPendingItem[] = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    kind: "assigned",
    from: {
      id: "manager-1",
      name: "Marcus Bell",
      email: "marcus@egain.com",
    },
    task: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Review the brief",
      description: null,
      scheduledDate: null,
      bucket: null,
      position: 0,
      startDate: null,
      deadline: null,
      completedAt: null,
      inProgress: false,
      carriedDays: 0,
      carriedSince: null,
      isPrivate: false,
      createdAt: "2026-09-10T08:00:00.000Z",
      updatedAt: "2026-09-10T08:00:00.000Z",
      commentCount: 0,
      project: null,
      jiraLinks: [],
      subtasks: [],
    },
    declineReason: null,
    createdAt: "2026-09-10T08:00:00.000Z",
  },
];

vi.mock("@/hooks/useViewportBand", () => ({
  useViewportBand: () => "desktop",
}));

vi.mock("@/components/chrome/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ open: false }),
}));

vi.mock("@tudu/store", () => ({
  useAcceptInboxItemMutation: () => [acceptInbox],
  useDeclineInboxItemMutation: () => [declineInbox],
  useDeleteTaskMutation: () => [deleteTask],
  useGetInboxQuery: () => ({
    data: {
      pending,
      history: [],
      count: pending.length,
    },
    isLoading: false,
    isError: false,
  }),
}));

describe("InboxRoute", () => {
  it("names the decline reason textarea for browser form diagnostics", async () => {
    const user = userEvent.setup();
    render(<InboxRoute />);

    await user.click(screen.getByRole("button", { name: /^Decline/ }));

    expect(
      screen.getByPlaceholderText(/^Why this cannot land/),
    ).toHaveAttribute("name", "inbox-decline-reason");
  });
});
