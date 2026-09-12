import type { AppNotification } from "@tudu/shared";
import { openTask, todayIso, type AppDispatch } from "@tudu/store";
import { TASK_TAB_FIELDS, taskLinkSearch } from "@/lib/daySearch";

export type NotificationSearch = {
  send?: boolean;
  date?: string;
  task?: string;
  tab?: "comments" | "timeline";
};

export type NotificationNavigate = (opts: {
  to: "/" | "/inbox" | "/unscheduled" | "/team/$userId";
  params?: { userId: string };
  search?: NotificationSearch;
}) => unknown;

export function bindNotificationNavigate(
  navigate: (opts: {
    to: "/" | "/inbox" | "/unscheduled" | "/team/$userId";
    params?: { userId: string };
    search?: NotificationSearch;
  }) => unknown,
): NotificationNavigate {
  return (opts) => {
    if (opts.to === "/team/$userId") {
      void navigate({
        to: "/team/$userId",
        params: { userId: opts.params?.userId ?? "" },
        search: opts.search ?? { send: false },
      });
      return;
    }
    void navigate({ to: opts.to, search: opts.search });
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
  const date = notification.scheduledDate ?? todayIso();

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
      search: taskLinkSearch({
        date,
        taskId: notification.taskId,
        tab: inspectorTab,
        extra: { send: false },
      }),
    });
    return;
  }

  if (!notification.scheduledDate) {
    void args.navigate({
      to: "/unscheduled",
      search: taskLinkSearch({
        date,
        taskId: notification.taskId,
        tab: inspectorTab,
        fields: TASK_TAB_FIELDS,
      }),
    });
    return;
  }

  void args.navigate({
    to: "/",
    search: taskLinkSearch({
      date,
      taskId: notification.taskId,
      tab: inspectorTab,
    }),
  });
}
