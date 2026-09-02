import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  JiraFetchResult,
  JiraSyncStatus,
  PublicConfig,
  SaveConfigInput,
  Task,
} from "./types";

function ensureDesktopApp(): void {
  if (!isTauri()) {
    throw new Error(
      "Settings only work in the Tudu desktop app. Run `npm run tauri:dev` or open Tudu.app.",
    );
  }
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  ensureDesktopApp();
  return invoke<T>(cmd, args);
}

export const api = {
  getConfig: () => tauriInvoke<PublicConfig>("get_config"),
  saveConfig: (input: SaveConfigInput) =>
    tauriInvoke<PublicConfig>("save_config", { input }),
  testJiraConnection: () =>
    tauriInvoke<{ ok: boolean; displayName: string; username: string }>(
      "test_jira_connection",
    ),
  listTasks: (date?: string) => tauriInvoke<Task[]>("list_tasks", { date }),
  addTask: (input: { text: string; date: string; parentId?: string | null }) =>
    tauriInvoke<Task>("add_task", {
      input: {
        text: input.text,
        date: input.date,
        parentId: input.parentId ?? null,
      },
    }),
  toggleTask: (id: string) => tauriInvoke<Task>("toggle_task", { id }),
  deleteTask: (id: string) => tauriInvoke<void>("delete_task", { id }),
  moveTask: (id: string, date: string) =>
    tauriInvoke<Task>("move_task", { id, date }),
  fetchJiraIssues: (trackChanges = false) =>
    tauriInvoke<JiraFetchResult>("fetch_jira_issues", { trackChanges }),
  triggerJiraSync: () => tauriInvoke<JiraFetchResult>("trigger_jira_sync"),
  getJiraSyncStatus: () => tauriInvoke<JiraSyncStatus>("get_jira_sync_status"),
  clearJiraPendingChanges: () => tauriInvoke<void>("clear_jira_pending_changes"),
  hideAvatar: () => tauriInvoke<void>("hide_avatar"),
  showMainWindow: () => tauriInvoke<void>("show_main_window"),
  triggerReminder: () => tauriInvoke<void>("trigger_reminder"),
};

export { isTauri };
