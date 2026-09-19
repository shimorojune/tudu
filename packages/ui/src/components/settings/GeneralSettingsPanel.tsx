import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isDesktopApp } from "@/lib/commands";
import {
  DEFAULT_QUICK_ADD_SHORTCUT,
  formatShortcutForDisplay,
  keyboardEventToAccelerator,
  readQuickAddShortcut,
  writeQuickAddShortcut,
} from "@/lib/quickAddPrefs";
import { emitQuickAddShortcutChanged } from "@/lib/quickAddMainSync";
import { ThemeModePicker } from "@/components/settings/ThemeModePicker";
import { ThemePalettePicker } from "@/components/settings/ThemePalettePicker";

async function tryRegisterShortcut(accelerator: string): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("register_quick_add_shortcut_command", { accelerator });
    return true;
  } catch {
    return false;
  }
}

async function pauseQuickAddShortcuts(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("pause_quick_add_shortcuts_command");
  } catch {
    // Web shell: no global shortcuts.
  }
}

async function resumeQuickAddShortcuts(): Promise<void> {
  await tryRegisterShortcut(readQuickAddShortcut());
}

export function GeneralSettingsPanel() {
  const desktop = isDesktopApp();
  const [shortcut, setShortcut] = useState(() => readQuickAddShortcut());
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    setShortcut(readQuickAddShortcut());
  }, []);

  useEffect(() => {
    if (!desktop) {
      return;
    }
    void resumeQuickAddShortcuts();
    return () => {
      void resumeQuickAddShortcuts();
    };
  }, [desktop]);

  const saveShortcut = useCallback(async (accelerator: string) => {
    const ok = await tryRegisterShortcut(accelerator);
    if (!ok) {
      toast.error("That shortcut is not available. Try another combination.");
      void resumeQuickAddShortcuts();
      return;
    }
    writeQuickAddShortcut(accelerator);
    setShortcut(accelerator);
    await emitQuickAddShortcutChanged(accelerator);
    toast.success(`Quick Add shortcut: ${formatShortcutForDisplay(accelerator)}`);
  }, []);

  useEffect(() => {
    if (!recording) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setRecording(false);
        void resumeQuickAddShortcuts();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const accelerator = keyboardEventToAccelerator(event);
      if (!accelerator) {
        return;
      }
      setRecording(false);
      void saveShortcut(accelerator);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, saveShortcut]);

  async function beginRecording() {
    if (!desktop) {
      return;
    }
    await pauseQuickAddShortcuts();
    setRecording(true);
  }

  return (
    <div className="px-[28px] py-[24px]">
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">General</h1>
      <p className="mt-[6px] max-w-[52ch] text-[13.5px] text-muted-foreground">
        App-wide preferences. Quick Add is available only in the desktop app.
      </p>

      <div className="mt-[28px]">
        <ThemeModePicker />
        <ThemePalettePicker />
      </div>

      {desktop ? (
        <section className="mt-[28px] max-w-[480px] space-y-[12px]">
          <h2 className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Quick Add shortcut
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Opens the floating task bar from any app while Tudu is running. The
            main window stays hidden. Click the field, press your shortcut once
            to set it. Esc cancels.
          </p>
          <div className="flex flex-wrap items-center gap-[10px]">
            <button
              type="button"
              className="min-w-[220px] border border-rule bg-background px-[12px] py-[9px] text-left text-[13px] whitespace-nowrap"
              onClick={() => {
                void beginRecording();
              }}
            >
              {recording
                ? "Press your shortcut now…"
                : formatShortcutForDisplay(shortcut)}
            </button>
            <button
              type="button"
              className="text-[12.5px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                void saveShortcut(DEFAULT_QUICK_ADD_SHORTCUT);
              }}
            >
              Reset to default ({formatShortcutForDisplay(DEFAULT_QUICK_ADD_SHORTCUT)})
            </button>
          </div>
        </section>
      ) : (
        <p className="mt-[28px] text-[13px] text-muted-foreground">
          Quick Add shortcuts are configured in the desktop app.
        </p>
      )}
    </div>
  );
}
