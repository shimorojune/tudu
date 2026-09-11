import type { AppNotification } from "@tudu/shared";
import { openTask, type AppDispatch } from "@tudu/store";

export type NotificationNavigate = (opts: {
  to: "/" | "/inbox" | "/unscheduled" | "/team/$userId";
  params?: { userId: string };
  search?: { send?: boolean };
}) => unknown;

export function bindNotificationNavigate(
  navigate: (opts: {
    to: "/" | "/inbox" | "/unscheduled" | "/team/$userId";
    params?: { userId: string };
    search?: { send?: boolean };
  }) => unknown,
): NotificationNavigate {
  return (opts) => {
    if (opts.to === "/team/$userId") {
      void navigate({
        to: "/team/$userId",
        params: { userId: opts.params?.userId ?? "" },
        search: { send: opts.search?.send ?? false },
      });
      return;
    }
    void navigate({ to: opts.to });
  };
}

export function openNotificationTarget(
  notification: AppNotification,
  args: {
    viewerId: string;
    dispatch: AppDispatch;
    navigate: NotificationNavigate;
  },
): void {
  if (notification.kind === "task_deleted" || !notification.taskId) {
    if (notification.kind === "inbox" || notification.kind === "inbox_declined") {
      void args.navigate({ to: "/inbox" });
    }
    return;
  }

  if (notification.kind === "inbox" || notification.kind === "inbox_declined") {
    void args.navigate({ to: "/inbox" });
    return;
  }

  const inspectorTab = notification.kind === "comment" ? "comments" : "details";
  const focusCommentId =
    notification.kind === "comment" ? notification.commentId : null;
  const isOwner =
    !notification.ownerId || notification.ownerId === args.viewerId;

  args.dispatch(
    openTask({
      date: notification.scheduledDate,
      taskId: notification.taskId,
      inspectorTab,
      focusCommentId,
    }),
  );

  if (!isOwner && notification.ownerId) {
    void args.navigate({
      to: "/team/$userId",
      params: { userId: notification.ownerId },
      search: { send: false },
    });
    return;
  }

  if (!notification.scheduledDate) {
    void args.navigate({ to: "/unscheduled" });
    return;
  }

  void args.navigate({ to: "/" });
}
