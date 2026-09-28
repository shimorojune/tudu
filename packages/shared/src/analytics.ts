import type { SyncOp } from "./sync.js";

export type AnalyticsEventPayload = {
  event: string;
  properties: Record<string, string | number | boolean>;
};

export function syncOpToAnalytics(op: SyncOp): AnalyticsEventPayload | null {
  switch (op.type) {
    case "task.create":
      return {
        event: "task_created",
        properties: { task_id: op.id, op_type: op.type },
      };
    case "task.update":
      return {
        event: "task_updated",
        properties: { task_id: op.id, op_type: op.type },
      };
    case "task.delete":
      return {
        event: "task_deleted",
        properties: { task_id: op.id, op_type: op.type },
      };
    case "task.reorder":
      return {
        event: "tasks_reordered",
        properties: { op_type: op.type },
      };
    case "task.rollover":
      return {
        event: "tasks_rolled_over",
        properties: { op_type: op.type },
      };
    case "subtask.create":
      return {
        event: "subtask_created",
        properties: {
          subtask_id: op.id,
          task_id: op.taskId,
          op_type: op.type,
        },
      };
    case "subtask.update":
      return {
        event: "subtask_updated",
        properties: { subtask_id: op.id, op_type: op.type },
      };
    case "subtask.delete":
      return {
        event: "subtask_deleted",
        properties: { subtask_id: op.id, op_type: op.type },
      };
    case "subtask.reorder":
      return {
        event: "subtasks_reordered",
        properties: { task_id: op.taskId, op_type: op.type },
      };
    case "comment.create":
      return {
        event: "comment_created",
        properties: {
          comment_id: op.id,
          task_id: op.taskId,
          op_type: op.type,
        },
      };
    case "comment.update":
      return {
        event: "comment_updated",
        properties: {
          comment_id: op.id,
          task_id: op.taskId,
          op_type: op.type,
        },
      };
    case "comment.delete":
      return {
        event: "comment_deleted",
        properties: {
          comment_id: op.id,
          task_id: op.taskId,
          op_type: op.type,
        },
      };
    case "notification.read":
    case "notification.readAll":
      return null;
    case "project.create":
      return {
        event: "project_created",
        properties: { project_id: op.id, op_type: op.type },
      };
    case "project.update":
      return {
        event: "project_updated",
        properties: { project_id: op.id, op_type: op.type },
      };
    case "project.delete":
      return {
        event: "project_deleted",
        properties: { project_id: op.id, op_type: op.type },
      };
    case "jira.link":
      return {
        event: "jira_task_linked",
        properties: {
          task_id: op.taskId,
          jira_issue_id: op.issueIdOrKey,
          op_type: op.type,
        },
      };
    case "jira.unlink":
      return {
        event: "jira_task_unlinked",
        properties: {
          task_id: op.taskId,
          jira_issue_id: op.issueIdOrKey,
          op_type: op.type,
        },
      };
    case "jira.task.spawn":
      return {
        event: "jira_task_spawned",
        properties: {
          task_id: op.id,
          jira_issue_id: op.body.issueId,
          op_type: op.type,
        },
      };
    case "jira.issue.create":
      return {
        event: "jira_issue_created",
        properties: {
          jira_issue_id: op.id,
          op_type: op.type,
        },
      };
    case "jira.issue.updateFields":
      return {
        event: "jira_issue_fields_updated",
        properties: {
          jira_issue_id: op.body.issueIdOrKey,
          op_type: op.type,
        },
      };
    case "jira.issue.updateDueDate":
      return {
        event: "jira_issue_due_date_updated",
        properties: {
          jira_issue_id: op.issueIdOrKey,
          op_type: op.type,
        },
      };
    case "jira.issue.updateAssignee":
      return {
        event: "jira_issue_assignee_updated",
        properties: {
          jira_issue_id: op.issueIdOrKey,
          op_type: op.type,
        },
      };
    case "jira.comment.create":
      return {
        event: "jira_comment_created",
        properties: {
          jira_issue_id: op.issueIdOrKey,
          op_type: op.type,
        },
      };
    default:
      return null;
  }
}

export type AnalyticsScreen =
  | "today"
  | "week"
  | "inbox"
  | "team"
  | "report_day"
  | "report_week"
  | "report_inbox"
  | "unscheduled"
  | "project"
  | "settings"
  | "sign_in"
  | "sign_up"
  | "unknown";

export function screenFromPathname(pathname: string): {
  screen: AnalyticsScreen;
  report_user_id?: string;
  project_id?: string;
} {
  if (pathname === "/" || pathname === "") {
    return { screen: "today" };
  }
  if (pathname === "/week") {
    return { screen: "week" };
  }
  if (pathname === "/inbox") {
    return { screen: "inbox" };
  }
  if (pathname === "/team") {
    return { screen: "team" };
  }
  if (pathname === "/unscheduled") {
    return { screen: "unscheduled" };
  }
  if (pathname === "/settings") {
    return { screen: "settings" };
  }
  if (pathname === "/sign-in") {
    return { screen: "sign_in" };
  }
  if (pathname === "/sign-up") {
    return { screen: "sign_up" };
  }

  const reportWeek = pathname.match(/^\/team\/([^/]+)\/week$/);
  if (reportWeek) {
    return { screen: "report_week", report_user_id: reportWeek[1] };
  }
  const reportInbox = pathname.match(/^\/team\/([^/]+)\/inbox$/);
  if (reportInbox) {
    return { screen: "report_inbox", report_user_id: reportInbox[1] };
  }
  const reportDay = pathname.match(/^\/team\/([^/]+)$/);
  if (reportDay) {
    return { screen: "report_day", report_user_id: reportDay[1] };
  }
  const project = pathname.match(/^\/projects\/([^/]+)$/);
  if (project) {
    return { screen: "project", project_id: project[1] };
  }

  return { screen: "unknown" };
}
