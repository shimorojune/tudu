export type HealthResponse = { status: "ok"; version: string };

export type MeResponse = {
  id: string;
  clerkUserId: string;
  email: string;
  createdAt: string;
};

export const DEFAULT_SERVER_PORT = 3456;
