import { tasksApi } from "@tudu/store";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "@tanstack/react-router";
import { isDesktopApp } from "@/lib/commands";
import { readQuickAddShortcut } from "@/lib/quickAddPrefs";

async function registerDesktopQuickAddShortcut(accelerator: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("register_quick_add_shortcut_command", { accelerator });
}

export function QuickAddMainSync() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }

    let unlistenTask: (() => void) | undefined;
    let unlistenSignIn: (() => void) | undefined;
    let unlistenPrefs: (() => void) | undefined;

    void import("@tauri-apps/api/event").then(({ listen }) => {
      void listen("task-created", () => {
        dispatch(tasksApi.util.invalidateTags(["Task"]));
      }).then((unlistenFn) => {
        unlistenTask = unlistenFn;
      });

      void listen("quick-add:open-sign-in", () => {
        void navigate({ to: "/sign-in" });
      }).then((unlistenFn) => {
        unlistenSignIn = unlistenFn;
      });

      void listen("quick-add:shortcut-changed", (event) => {
        const next =
          typeof event.payload === "string" && event.payload.length > 0
            ? event.payload
            : readQuickAddShortcut();
        void registerDesktopQuickAddShortcut(next).catch((error) => {
          console.error("Failed to update Quick Add shortcut", error);
        });
      }).then((unlistenFn) => {
        unlistenPrefs = unlistenFn;
      });
    });

    return () => {
      unlistenTask?.();
      unlistenSignIn?.();
      unlistenPrefs?.();
    };
  }, [dispatch, navigate]);

  return null;
}

export async function emitQuickAddShortcutChanged(accelerator: string) {
  if (!isDesktopApp()) {
    return;
  }
  const { emit } = await import("@tauri-apps/api/event");
  await emit("quick-add:shortcut-changed", accelerator);
}

export async function registerQuickAddShortcutFromPrefs() {
  const accelerator = readQuickAddShortcut();
  await registerDesktopQuickAddShortcut(accelerator);
}

