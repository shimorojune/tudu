export * from "./tasks.js";
export * from "./activity.js";
export * from "./timeline.js";
export * from "./day.js";
export * from "./linkPreview.js";

export type HealthResponse = { status: "ok"; version: string };

export type MeResponse = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export const DEFAULT_SERVER_PORT = 3456;
