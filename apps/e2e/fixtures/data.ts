import type { APIRequestContext } from "@playwright/test";
import { E2E_SERVER_URL } from "../constants.js";

export function uniqueTaskTitle(prefix: string): string {
  return `${prefix} ${Date.now()}`;
}

export async function createTaskForToday(
  request: APIRequestContext,
  title: string,
  date: string,
) {
  const response = await request.post(`${E2E_SERVER_URL}/tasks`, {
    data: {
      title,
      bucket: "later",
      scheduledDate: date,
    },
  });
  if (!response.ok()) {
    throw new Error(
      `createTaskForToday failed: ${response.status()} ${await response.text()}`,
    );
  }
  return (await response.json()) as { task: { id: string; title: string } };
}
