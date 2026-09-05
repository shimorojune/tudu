export * from "./tasks.js";

export type HealthResponse = { status: "ok"; version: string };

export type MeResponse = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export const DEFAULT_SERVER_PORT = 3456;
