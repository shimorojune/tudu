import { useEffect } from "react";

const SAVE_POSITION_DEBOUNCE_MS = 120;

async function persistQuickAddWindowPosition(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { invoke } = await import("@tauri-apps/api/core");
    const window = getCurrentWindow();
    if (!window.label.includes("quick-add")) {
      return;
    }
    const position = await window.outerPosition();
    const scale = await window.scaleFactor();
    await invoke("save_quick_add_window_position", {
      x: position.x / scale,
      y: position.y / scale,
    });
  } catch {
    // Web dev shell: no Tauri window APIs.
  }
}

export async function startQuickAddWindowDrag(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    if (!window.label.includes("quick-add")) {
      return;
    }
    await window.startDragging();
  } catch {
    // Non-Tauri.
  }
}

export function useQuickAddWindowDrag() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let saveTimeoutId: ReturnType<typeof setTimeout> | undefined;

    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow())
      .then(async (window) => {
        if (!window.label.includes("quick-add")) {
          return;
        }

        unlisten = await window.onMoved(() => {
          if (saveTimeoutId) {
            clearTimeout(saveTimeoutId);
          }
          saveTimeoutId = setTimeout(() => {
            saveTimeoutId = undefined;
            void persistQuickAddWindowPosition();
          }, SAVE_POSITION_DEBOUNCE_MS);
        });
      })
      .catch(() => {
        // Web dev shell: no Tauri window APIs.
      });

    return () => {
      unlisten?.();
      if (saveTimeoutId) {
        clearTimeout(saveTimeoutId);
      }
    };
  }, []);
}
