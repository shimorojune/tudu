import { describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@tudu/shared";
import { makeStore } from "@tudu/store";
import { TASK_TAB_FIELDS, taskLinkSearch } from "./daySearch";
import { openNotificationTarget } from "./openNotificationTarget";

const base: AppNotification = {
  id: "88888888-8888-4888-8888-888888888888",
  userId: "priya",
  actorId: "marcus",
  kind: "comment",
  taskId: "11111111-1111-4111-8111-111111111111",
  ownerId: "priya",
  commentId: "22222222-2222-4222-8222-222222222222",
  inboxItemId: null,
  scheduledDate: "2026-09-10",
  jiraIssueId: null,
  jiraIssueKey: null,
  appVersion: null,
  metadata: null,
  taskTitle: "Ship it",
  body: "Marcus commented on Ship it: Looks good",
  readAt: null,
  createdAt: "2026-09-10T08:00:00.000Z",
};

describe("openNotificationTarget", () => {
  it("opens the comments tab on the owner's day", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(base, {
      viewerId: "priya",
      dispatch: store.dispatch,
      navigate,
    });
    expect(store.getState().day.selectedTaskId).toBe(base.taskId);
    expect(store.getState().day.inspectorTab).toBe("comments");
    expect(store.getState().day.focusCommentId).toBe(base.commentId);
    expect(navigate).toHaveBeenCalledWith({
      to: "/",
      search: taskLinkSearch({
        date: base.scheduledDate ?? "",
        taskId: base.taskId ?? "",
        tab: "comments",
      }),
    });
  });

  it("opens the report day for a manager", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(base, {
      viewerId: "marcus",
      dispatch: store.dispatch,
      navigate,
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/team/$userId",
      params: { userId: "priya" },
      search: taskLinkSearch({
        date: base.scheduledDate ?? "",
        taskId: base.taskId ?? "",
        tab: "comments",
        extra: { send: false },
      }),
    });
    expect(store.getState().day.inspectorTab).toBe("comments");
  });

  it("goes to inbox for a declined task", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(
      { ...base, kind: "inbox_declined", scheduledDate: null },
      { viewerId: "marcus", dispatch: store.dispatch, navigate },
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/inbox" });
    expect(store.getState().day.selectedTaskId).toBeNull();
  });

  it("goes to inbox for an inbox card", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(
      { ...base, kind: "inbox", taskId: base.taskId },
      { viewerId: "priya", dispatch: store.dispatch, navigate },
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/inbox" });
  });

  it("goes to Unscheduled when the task has no day", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(
      { ...base, scheduledDate: null },
      { viewerId: "priya", dispatch: store.dispatch, navigate },
    );
    expect(navigate).toHaveBeenCalledWith({
      to: "/unscheduled",
      search: taskLinkSearch({
        date: "unused",
        taskId: base.taskId ?? "",
        tab: "comments",
        fields: TASK_TAB_FIELDS,
      }),
    });
    expect(store.getState().day.inspectorTab).toBe("comments");
  });

  it("opens Today for focus reminder with no task", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(
      { ...base, kind: "reminder_focus", taskId: null },
      { viewerId: "priya", dispatch: store.dispatch, navigate },
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/", search: {} });
  });

  it("does not open a deleted task", () => {
    const store = makeStore();
    const navigate = vi.fn();
    openNotificationTarget(
      { ...base, kind: "task_deleted" },
      { viewerId: "priya", dispatch: store.dispatch, navigate },
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().day.selectedTaskId).toBeNull();
  });
});
