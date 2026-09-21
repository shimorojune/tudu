import type { AppNotification } from "@tudu/shared";
import { openTask, todayIso, type AppDispatch } from "@tudu/store";
import { TASK_TAB_FIELDS, taskLinkSearch } from "@/lib/daySearch";

export type NotificationSearch = {
  send?: boolean;
  date?: string;
  task?: string;
  tab?: "comments" | "timeline";
  jira?: string;
};

export type NotificationNavigate = (opts: {
  to: "/" | "/inbox" | "/unscheduled" | "/team/$userId" | "/settings";
  params?: { userId: string };
  search?: NotificationSearch & { section?: string };
}) => unknown;

export function bindNotificationNavigate(
  navigate: (opts: {
    to: "/" | "/inbox" | "/unscheduled" | "/team/$userId" | "/settings";
    params?: { userId: string };
    search?: NotificationSearch & { section?: string };
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

function openTaskNotification(
  notification: AppNotification,
  args: {
    viewerId: string;
    dispatch: AppDispatch;
    navigate: NotificationNavigate;
  },
  inspectorTab: "details" | "comments" | "timeline",
): void {
  if (!notification.taskId) {
    return;
  }
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
    search: {
      ...taskLinkSearch({
        date,
        taskId: notification.taskId,
        tab: inspectorTab,
      }),
      ...(notification.jiraIssueKey ? { jira: notification.jiraIssueKey } : {}),
    },
  });
}

export function openNotificationTarget(
  notification: AppNotification,
  args: {
    viewerId: string;
    dispatch: AppDispatch;
    navigate: NotificationNavigate;
  },
): void {
  if (notification.kind === "app_update") {
    void args.navigate({
      to: "/settings",
      search: { section: "notifications" },
    });
    return;
  }

  if (notification.kind === "inbox" || notification.kind === "inbox_declined") {
    void args.navigate({ to: "/inbox" });
    return;
  }

  if (notification.kind === "task_deleted") {
    return;
  }

  if (notification.kind.startsWith("jira_")) {
    if (notification.taskId) {
      openTaskNotification(notification, args, "details");
      return;
    }
    if (notification.jiraIssueKey) {
      void args.navigate({
        to: "/",
        search: { jira: notification.jiraIssueKey },
      });
    }
    return;
  }

  if (notification.kind === "reminder_focus" && !notification.taskId) {
    void args.navigate({ to: "/", search: {} });
    return;
  }

  if (notification.kind.startsWith("reminder_")) {
    openTaskNotification(notification, args, "details");
    return;
  }

  if (!notification.taskId) {
    return;
  }

  const inspectorTab = notification.kind === "comment" ? "comments" : "details";
  openTaskNotification(notification, args, inspectorTab);
}
