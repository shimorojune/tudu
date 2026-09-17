import { readQuickAddShortcut } from "@/lib/quickAddPrefs";
import { useEffect } from "react";

export function QuickAddShortcutBootstrap() {
  useEffect(() => {
    const accelerator = readQuickAddShortcut();
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("register_quick_add_shortcut_command", { accelerator }),
      )
      .catch((error) => {
        console.error("Failed to apply Quick Add shortcut preference", error);
      });
  }, []);

  return null;
}
