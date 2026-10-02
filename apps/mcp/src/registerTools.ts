import { PERSONAL_REQUESTS_SPACE } from "@tudu/shared";
import type { McpServer } from "skybridge/server";
import { text } from "skybridge/server";
import { z } from "zod";
import {
  apiFromExtra,
  orgQuery,
  resolveOrgSlug,
  todayIsoDate,
  writeCreatedResult,
} from "./toolHelpers.js";

const orgIdSchema = z
  .string()
  .uuid()
  .optional()
  .describe("Organization space id. Omit for your personal space.");

const readSecurity = [{ type: "oauth2" as const, scopes: ["tasks:read"] }];
const writeSecurity = [{ type: "oauth2" as const, scopes: ["tasks:write"] }];

export function registerTuduTools(server: McpServer) {
  return server
    .registerTool(
      {
        name: "list_spaces",
        description: "List spaces you can access (personal and organizations).",
        inputSchema: {},
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
        view: { component: "space_picker", description: "Pick a Tudu space" },
      },
      async (_input, extra) => {
        const api = apiFromExtra(extra);
        const data = await api.get<{ spaces: unknown[] }>("/orgs");
        const structuredContent = { spaces: data.spaces };
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "list_tasks",
        description:
          "List tasks for today, a specific day, the unscheduled backlog, or a project. When view is day, date is required (YYYY-MM-DD). When view is project, projectId is required.",
        inputSchema: {
          orgId: orgIdSchema,
          view: z
            .enum(["today", "day", "unscheduled", "project"])
            .default("today")
            .describe(
              "today: current calendar day. day: needs date. unscheduled: no scheduled date. project: needs projectId.",
            ),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional()
            .describe("Required when view is day (YYYY-MM-DD)."),
          projectId: z
            .string()
            .uuid()
            .optional()
            .describe("Required when view is project."),
        },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
        view: { component: "task_list", description: "Task list" },
      },
      async ({ orgId, view, date, projectId }, extra) => {
        const api = apiFromExtra(extra);
        let tasks: unknown[] = [];
        if (view === "project" && projectId) {
          const boot = await api.bootstrap([`project:${projectId}`]);
          tasks = boot.events
            .filter((event) => event.type === "task.upsert")
            .map((event) => (event.payload as { task?: unknown })?.task)
            .filter(Boolean);
        } else if (view === "unscheduled") {
          const data = await api.get<{ tasks: unknown[] }>(
            `/tasks/unscheduled${orgQuery(orgId)}`,
          );
          tasks = data.tasks;
        } else {
          const day = view === "day" ? date : todayIsoDate();
          if (!day) {
            throw new Error("date is required when view is day");
          }
          const data = await api.get<{ tasks: unknown[] }>(
            `/tasks?date=${day}${orgId ? `&orgId=${orgId}` : ""}`,
          );
          tasks = data.tasks;
        }
        const structuredContent = { tasks };
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "get_task",
        description: "Get a task by id or human-readable key.",
        inputSchema: {
          taskId: z.string().uuid().optional(),
          key: z.string().optional(),
        },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
        view: { component: "task_detail", description: "Task detail" },
      },
      async ({ taskId, key }, extra) => {
        const api = apiFromExtra(extra);
        if (!taskId && !key) {
          throw new Error("Provide taskId or key");
        }
        const data = key
          ? await api.get<{ task: unknown }>(
              `/tasks/by-key/${encodeURIComponent(key)}`,
            )
          : await (async () => {
              const boot = await api.bootstrap([`taskDetail:${taskId!}`]);
              const taskEvent = boot.events.find(
                (event) => event.type === "task.upsert",
              );
              return {
                task: (taskEvent?.payload as { task?: unknown })?.task ?? null,
              };
            })();
        const structuredContent = data;
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "create_task",
        description: "Create a task in a space.",
        inputSchema: {
          orgId: orgIdSchema,
          title: z.string().trim().min(1).max(500),
          scheduledDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          description: z.string().nullable().optional(),
          projectId: z.string().uuid().nullable().optional(),
        },
        securitySchemes: writeSecurity,
      },
      async (input, extra) => {
        const api = apiFromExtra(extra);
        const taskId = crypto.randomUUID();
        await api.sync({
          type: "task.create",
          id: taskId,
          body: {
            title: input.title,
            orgId: input.orgId ?? null,
            scheduledDate: input.scheduledDate ?? null,
            bucket: null,
            startDate: null,
            deadline: null,
            isPrivate: false,
            description: input.description ?? null,
            projectId: input.projectId ?? null,
          },
        });
        return writeCreatedResult("Task created", { taskId });
      },
    )
    .registerTool(
      {
        name: "update_task",
        description:
          "Update task title, description, or scheduled date. To mark complete or incomplete, use complete_task instead.",
        inputSchema: {
          taskId: z.string().uuid(),
          title: z.string().optional(),
          scheduledDate: z.string().nullable().optional(),
          description: z.string().nullable().optional(),
        },
        securitySchemes: writeSecurity,
      },
      async ({ taskId, ...patch }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "task.update",
          id: taskId,
          patch,
        });
        return { content: [text("Task updated")], isError: false };
      },
    )
    .registerTool(
      {
        name: "complete_task",
        description: "Mark a task complete or incomplete.",
        inputSchema: {
          taskId: z.string().uuid(),
          completed: z.boolean(),
        },
        securitySchemes: writeSecurity,
      },
      async ({ taskId, completed }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "task.update",
          id: taskId,
          patch: { completed },
        });
        return { content: [text("Task updated")], isError: false };
      },
    )
    .registerTool(
      {
        name: "delete_task",
        description: "Soft-delete a task.",
        inputSchema: { taskId: z.string().uuid() },
        securitySchemes: writeSecurity,
        annotations: { destructiveHint: true },
      },
      async ({ taskId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({ type: "task.delete", id: taskId });
        return { content: [text("Task deleted")], isError: false };
      },
    )
    .registerTool(
      {
        name: "move_task_to_space",
        description: "Move a task to another space.",
        inputSchema: {
          taskId: z.string().uuid(),
          orgId: z.string().uuid(),
          projectId: z.string().uuid().nullable().optional(),
          isPrivate: z.boolean().optional(),
        },
        securitySchemes: writeSecurity,
      },
      async ({ taskId, orgId, projectId, isPrivate }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "task.moveToSpace",
          body: {
            taskId,
            orgId,
            projectId: projectId ?? null,
            isPrivate: isPrivate ?? false,
          },
        });
        return { content: [text("Task moved")], isError: false };
      },
    )
    .registerTool(
      {
        name: "create_subtask",
        description: "Add a subtask to a task.",
        inputSchema: {
          taskId: z.string().uuid(),
          title: z.string().trim().min(1).max(500),
        },
        securitySchemes: writeSecurity,
      },
      async ({ taskId, title }, extra) => {
        const api = apiFromExtra(extra);
        const subtaskId = crypto.randomUUID();
        await api.sync({
          type: "subtask.create",
          id: subtaskId,
          taskId,
          body: { title },
        });
        return writeCreatedResult("Subtask created", { subtaskId, taskId });
      },
    )
    .registerTool(
      {
        name: "update_subtask",
        description: "Update a subtask.",
        inputSchema: {
          subtaskId: z.string().uuid(),
          title: z.string().optional(),
          completed: z.boolean().optional(),
        },
        securitySchemes: writeSecurity,
      },
      async ({ subtaskId, ...patch }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "subtask.update",
          id: subtaskId,
          patch,
        });
        return { content: [text("Subtask updated")], isError: false };
      },
    )
    .registerTool(
      {
        name: "delete_subtask",
        description: "Soft-delete a subtask.",
        inputSchema: { subtaskId: z.string().uuid() },
        securitySchemes: writeSecurity,
        annotations: { destructiveHint: true },
      },
      async ({ subtaskId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({ type: "subtask.delete", id: subtaskId });
        return { content: [text("Subtask deleted")], isError: false };
      },
    )
    .registerTool(
      {
        name: "list_projects",
        description: "List projects in a space.",
        inputSchema: { orgId: orgIdSchema },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
      },
      async ({ orgId }, extra) => {
        const api = apiFromExtra(extra);
        const boot = await api.bootstrap(["projects"]);
        const projects = boot.events
          .filter((event) => event.type === "project.upsert")
          .map((event) => event.payload);
        const filtered = orgId
          ? (projects as Array<{ orgId?: string | null }>).filter(
              (project) => project.orgId === orgId,
            )
          : (projects as Array<{ orgId?: string | null }>).filter(
              (project) => project.orgId == null,
            );
        const structuredContent = { projects: filtered };
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "create_project",
        description: "Create a project.",
        inputSchema: {
          orgId: orgIdSchema,
          name: z.string().trim().min(1).max(200),
        },
        securitySchemes: writeSecurity,
      },
      async ({ orgId, name }, extra) => {
        const api = apiFromExtra(extra);
        const projectId = crypto.randomUUID();
        await api.sync({
          type: "project.create",
          id: projectId,
          body: { name, color: "graphite", orgId: orgId ?? null },
        });
        return writeCreatedResult("Project created", { projectId });
      },
    )
    .registerTool(
      {
        name: "update_project",
        description: "Rename or update a project.",
        inputSchema: {
          projectId: z.string().uuid(),
          name: z.string().optional(),
        },
        securitySchemes: writeSecurity,
      },
      async ({ projectId, ...patch }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "project.update",
          id: projectId,
          patch,
        });
        return { content: [text("Project updated")], isError: false };
      },
    )
    .registerTool(
      {
        name: "delete_project",
        description: "Delete an empty project.",
        inputSchema: { projectId: z.string().uuid() },
        securitySchemes: writeSecurity,
        annotations: { destructiveHint: true },
      },
      async ({ projectId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({ type: "project.delete", id: projectId });
        return { content: [text("Project deleted")], isError: false };
      },
    )
    .registerTool(
      {
        name: "list_comments",
        description: "List comments on a task.",
        inputSchema: { taskId: z.string().uuid() },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
      },
      async ({ taskId }, extra) => {
        const api = apiFromExtra(extra);
        const data = await api.get<{ comments: unknown[] }>(
          `/tasks/${taskId}/comments`,
        );
        const structuredContent = data;
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "add_comment",
        description: "Add a comment to a task.",
        inputSchema: {
          taskId: z.string().uuid(),
          body: z.string().trim().min(1).max(5000),
        },
        securitySchemes: writeSecurity,
      },
      async ({ taskId, body }, extra) => {
        const api = apiFromExtra(extra);
        const commentId = crypto.randomUUID();
        await api.sync({
          type: "comment.create",
          id: commentId,
          taskId,
          body: { body },
        });
        return writeCreatedResult("Comment added", { commentId, taskId });
      },
    )
    .registerTool(
      {
        name: "edit_comment",
        description: "Edit a comment.",
        inputSchema: {
          taskId: z.string().uuid(),
          commentId: z.string().uuid(),
          body: z.string().trim().min(1).max(5000),
        },
        securitySchemes: writeSecurity,
      },
      async ({ taskId, commentId, body }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "comment.update",
          id: commentId,
          taskId,
          patch: { body },
        });
        return { content: [text("Comment updated")], isError: false };
      },
    )
    .registerTool(
      {
        name: "delete_comment",
        description: "Soft-delete a comment.",
        inputSchema: {
          taskId: z.string().uuid(),
          commentId: z.string().uuid(),
        },
        securitySchemes: writeSecurity,
        annotations: { destructiveHint: true },
      },
      async ({ taskId, commentId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "comment.delete",
          id: commentId,
          taskId,
        });
        return { content: [text("Comment deleted")], isError: false };
      },
    )
    .registerTool(
      {
        name: "get_timeline",
        description: "Read task activity timeline.",
        inputSchema: { taskId: z.string().uuid() },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
      },
      async ({ taskId }, extra) => {
        const api = apiFromExtra(extra);
        const data = await api.get<{ events: unknown[] }>(
          `/tasks/${taskId}/timeline`,
        );
        const structuredContent = data;
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "list_coworkers",
        description: "List co-workers in an organization for a day.",
        inputSchema: {
          orgId: z.string().uuid(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
      },
      async ({ orgId, date }, extra) => {
        const api = apiFromExtra(extra);
        const slug = await resolveOrgSlug(api, orgId);
        const day = date ?? todayIsoDate();
        const data = await api.get<unknown>(
          `/orgs/${slug}/coworkers?date=${day}`,
        );
        const structuredContent = { coworkers: data };
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "get_coworker_day",
        description: "View a co-worker's tasks for a day in an org.",
        inputSchema: {
          orgId: z.string().uuid(),
          userId: z.string().min(1),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
      },
      async ({ orgId, userId, date }, extra) => {
        const api = apiFromExtra(extra);
        const slug = await resolveOrgSlug(api, orgId);
        const day = date ?? todayIsoDate();
        const data = await api.get<unknown>(
          `/orgs/${slug}/coworkers/${encodeURIComponent(userId)}/day?date=${day}`,
        );
        const structuredContent = { day: data };
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "list_requests",
        description: "List task requests in a space.",
        inputSchema: { orgId: orgIdSchema },
        securitySchemes: readSecurity,
        annotations: { readOnlyHint: true },
      },
      async ({ orgId }, extra) => {
        const api = apiFromExtra(extra);
        const space = orgId ?? PERSONAL_REQUESTS_SPACE;
        const boot = await api.bootstrap([`requests:${space}`]);
        const requests = boot.events
          .filter((event) => event.type === "request.upsert")
          .map((event) => event.payload);
        const structuredContent = { requests };
        return {
          structuredContent,
          content: [text(JSON.stringify(structuredContent, null, 2))],
          isError: false,
        };
      },
    )
    .registerTool(
      {
        name: "send_task_request",
        description: "Send a new task request to a co-worker.",
        inputSchema: {
          orgId: z.string().uuid(),
          toUserId: z.string().min(1),
          title: z.string().trim().min(1).max(500),
          message: z.string().max(500).nullable().optional(),
        },
        securitySchemes: writeSecurity,
      },
      async ({ orgId, toUserId, title, message }, extra) => {
        const api = apiFromExtra(extra);
        const requestId = crypto.randomUUID();
        await api.sync({
          type: "request.send",
          id: requestId,
          body: {
            orgId,
            toUserId,
            title,
            description: null,
            message: message ?? null,
          },
        });
        return writeCreatedResult("Request sent", { requestId });
      },
    )
    .registerTool(
      {
        name: "accept_request",
        description: "Accept a pending task request.",
        inputSchema: { requestId: z.string().uuid() },
        securitySchemes: writeSecurity,
      },
      async ({ requestId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "request.accept",
          body: { requestId },
        });
        return { content: [text("Request accepted")], isError: false };
      },
    )
    .registerTool(
      {
        name: "decline_request",
        description: "Decline a pending task request.",
        inputSchema: { requestId: z.string().uuid() },
        securitySchemes: writeSecurity,
        annotations: { destructiveHint: true },
      },
      async ({ requestId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "request.decline",
          body: { requestId },
        });
        return { content: [text("Request declined")], isError: false };
      },
    )
    .registerTool(
      {
        name: "withdraw_request",
        description: "Withdraw a task request you sent.",
        inputSchema: { requestId: z.string().uuid() },
        securitySchemes: writeSecurity,
      },
      async ({ requestId }, extra) => {
        const api = apiFromExtra(extra);
        await api.sync({
          type: "request.withdraw",
          body: { requestId },
        });
        return { content: [text("Request withdrawn")], isError: false };
      },
    );
}
