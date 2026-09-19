export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tudu.theme";

/** PWA status bar; matches :root / .dark --background in theme.css */
export const THEME_COLOR_LIGHT = "#f9f9f9";
export const THEME_COLOR_DARK = "#111111";

export function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

export function writeStoredTheme(preference: ThemePreference) {
  window.localStorage.setItem(STORAGE_KEY, preference);
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function syncThemeColorMeta(resolved: ResolvedTheme) {
  const color =
    resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", color);
  }
}

export function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  syncThemeColorMeta(resolved);
}
