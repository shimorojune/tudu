import { isDesktopApp } from "@/lib/commands";

export async function syncQuickAddWindowFrame(panel: HTMLElement) {
  if (!isDesktopApp()) {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { invoke } = await import("@tauri-apps/api/core");
  const window = getCurrentWindow();
  if (window.label !== "quick-add") {
    return;
  }

  const scale = await window.scaleFactor();
  const width = Math.ceil(panel.offsetWidth / scale);
  const height = Math.ceil(panel.offsetHeight / scale);
  await invoke("place_quick_add_window_command", { width, height });
}
