import { createRoot } from "react-dom/client";
import { QuickAddTaskPane } from "@tudu/ui/quick-add";
import { AppProviders } from "@tudu/ui/providers";
import { QuickAddShortcutBootstrap } from "./QuickAddShortcutBootstrap";
import "@tudu/ui/styles.css";

async function closeQuickAdd(afterSave = false) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("hide_quick_add_window", { afterSave });
}

async function openSignIn() {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("show_main_window_command");
}

createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <QuickAddShortcutBootstrap />
    <QuickAddTaskPane
      onClose={(reason) => {
        void closeQuickAdd(reason?.afterSave === true);
      }}
      onRequestSignIn={() => {
        void openSignIn();
      }}
    />
  </AppProviders>,
);
