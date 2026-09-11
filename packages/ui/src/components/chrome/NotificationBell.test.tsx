import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { makeStore } from "@tudu/store";
import { NotificationBell } from "./NotificationBell";

const readOne = vi.fn();
const readAll = vi.fn();
const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetMeQuery: () => ({ data: { id: "priya" } }),
    useGetNotificationsQuery: () => ({
      data: {
        unreadCount: 1,
        notifications: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            userId: "priya",
            actorId: "marcus",
            kind: "comment",
            taskId: "11111111-1111-4111-8111-111111111111",
            ownerId: "priya",
            commentId: "22222222-2222-4222-8222-222222222222",
            inboxItemId: null,
            scheduledDate: "2026-09-10",
            taskTitle: "Ship it",
            body: "Marcus commented on Ship it: Looks good",
            readAt: null,
            createdAt: "2026-09-10T08:00:00.000Z",
          },
        ],
      },
    }),
    useReadNotificationMutation: () => [readOne, { isLoading: false }],
    useReadAllNotificationsMutation: () => [readAll, { isLoading: false }],
  };
});

describe("NotificationBell", () => {
  it("shows an unread count and opens the comments tab on click", async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <NotificationBell />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: "Notifications 1" }).textContent).toContain(
      "1",
    );

    await user.click(screen.getByRole("button", { name: "Notifications 1" }));
    expect(screen.getByText("Marcus commented on Ship it: Looks good")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Marcus commented on Ship it/ }));

    expect(readOne).toHaveBeenCalledWith("88888888-8888-4888-8888-888888888888");
    expect(store.getState().day.inspectorTab).toBe("comments");
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });
});
