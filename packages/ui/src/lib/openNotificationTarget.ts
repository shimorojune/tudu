import type { AppNotification } from "@tudu/shared";
import { openTask, todayIso, type AppDispatch } from "@tudu/store";
import { TASK_TAB_FIELDS, taskLinkSearch } from "@/lib/daySearch";

export type NotificationSearch = {
  date?: string;
  task?: string;
  tab?: "comments" | "timeline";
  jira?: string;
  section?: string;
};

export type NotificationNavigate = (opts: {
  to: "/" | "/unscheduled" | "/settings" | "/week";
  search?: NotificationSearch;
}) => unknown;

export function bindNotificationNavigate(
  navigate: NotificationNavigate,
): NotificationNavigate {
  return (opts) => navigate(opts);
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
  const date = notification.scheduledDate ?? todayIso();

  args.dispatch(
    openTask({
      date: notification.scheduledDate,
      taskId: notification.taskId,
      inspectorTab,
      focusCommentId,
    }),
  );

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
    void args.navigate({ to: "/unscheduled" });
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

  if (!notification.taskId) {
    return;
  }

  const inspectorTab = notification.kind === "comment" ? "comments" : "details";
  openTaskNotification(notification, args, inspectorTab);
}
