export const QUICK_ADD_SHORTCUT_STORAGE_KEY = "tudu:quickAddShortcut";

export const DEFAULT_QUICK_ADD_SHORTCUT = "CommandOrControl+Shift+N";

export function readQuickAddShortcut(): string {
  if (typeof localStorage === "undefined") {
    return DEFAULT_QUICK_ADD_SHORTCUT;
  }
  const stored = localStorage.getItem(QUICK_ADD_SHORTCUT_STORAGE_KEY);
  return stored && stored.trim().length > 0 ? stored : DEFAULT_QUICK_ADD_SHORTCUT;
}

export function writeQuickAddShortcut(accelerator: string): void {
  localStorage.setItem(QUICK_ADD_SHORTCUT_STORAGE_KEY, accelerator);
}

export function formatShortcutForDisplay(accelerator: string): string {
  return accelerator
    .split("+")
    .filter((part) => part.length > 0)
    .map((part) => {
      switch (part) {
        case "CommandOrControl":
          return "Cmd";
        case "Command":
          return "Cmd";
        case "Control":
          return "Ctrl";
        case "Alt":
          return "Option";
        case "Shift":
          return "Shift";
        case "Super":
          return "Super";
        case "Space":
          return "Space";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(" + ");
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

export function keyboardEventToAccelerator(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }
  if (event.key === "Escape" || event.key === "Tab") {
    return null;
  }

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) {
    parts.push("CommandOrControl");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.altKey) {
    parts.push("Alt");
  }

  const key = normalizeShortcutKey(event);
  if (!key) {
    return null;
  }

  parts.push(key);
  if (parts.length < 2) {
    return null;
  }
  return parts.join("+");
}

function normalizeShortcutKey(event: KeyboardEvent): string | null {
  if (event.code === "Space" || event.key === " " || event.key === "Space") {
    return "Space";
  }

  const key = event.key;
  if (!key || key.length === 0) {
    return null;
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (key === "ArrowUp") {
    return "Up";
  }
  if (key === "ArrowDown") {
    return "Down";
  }
  if (key === "ArrowLeft") {
    return "Left";
  }
  if (key === "ArrowRight") {
    return "Right";
  }
  return key;
}
