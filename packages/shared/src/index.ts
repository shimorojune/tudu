export * from "./tasks.js";
export * from "./jira.js";
export * from "./projects.js";
export * from "./activity.js";
export * from "./timeline.js";
export * from "./day.js";
export * from "./linkPreview.js";
export * from "./manager.js";
export * from "./sync.js";
export * from "./notifications.js";
export * from "./richTextHtml.js";
export * from "./attachments.js";
export * from "./apiUrl.js";
export * from "./analytics.js";

export type HealthResponse = { status: "ok"; version: string };

export type MeResponse = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export const DEFAULT_SERVER_PORT = 3456;
