import type { ResolvedTheme } from "@/lib/theme";
import {
  FONT_STACKS,
  getPresetTokens,
  type CustomThemeColors,
  type FontId,
  type PaletteId,
  type ThemeTokenMap,
} from "@/lib/themePalettes";

export const PALETTE_STORAGE_KEY = "tudu.theme.palette";
export const CUSTOM_COLORS_STORAGE_KEY = "tudu.theme.custom";
export const FONT_STORAGE_KEY = "tudu.theme.font";

const MANAGED_KEYS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--hair",
  "--ghost",
  "--rule",
  "--faint",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--font-sans",
] as const;

export function readStoredPaletteId(): PaletteId {
  if (typeof window === "undefined") {
    return "current";
  }
  const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
  if (
    stored === "modernist" ||
    stored === "github" ||
    stored === "current" ||
    stored === "neutral" ||
    stored === "custom"
  ) {
    return stored;
  }
  return "current";
}

export function writeStoredPaletteId(paletteId: PaletteId) {
  window.localStorage.setItem(PALETTE_STORAGE_KEY, paletteId);
}

export function readStoredCustomColors(): CustomThemeColors {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as CustomThemeColors;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function writeStoredCustomColors(colors: CustomThemeColors) {
  window.localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(colors));
}

export function readStoredFontId(): FontId {
  if (typeof window === "undefined") {
    return "ar-one-sans";
  }
  const stored = window.localStorage.getItem(FONT_STORAGE_KEY);
  if (stored === "archivo" || stored === "ar-one-sans" || stored === "system") {
    return stored;
  }
  return "ar-one-sans";
}

export function writeStoredFontId(fontId: FontId) {
  window.localStorage.setItem(FONT_STORAGE_KEY, fontId);
}

/** Raised surface (card, popover) slightly lighter than page background. */
export function deriveElevatedSurface(background: string): string | null {
  const hex = background.trim();
  if (!hex.startsWith("#") || hex.length !== 7) {
    return null;
  }
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const avg = (r + g + b) / 3;
  const elevate = (channel: number) => {
    const next =
      avg < 40
        ? channel + Math.round((255 - channel) * 0.08)
        : channel + 10;
    return Math.min(255, next);
  };
  const toHex = (channel: number) =>
    elevate(channel).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function contrastForeground(color: string): string {
  const hex = color.trim();
  if (hex.startsWith("#") && hex.length === 7) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "#201e1d" : "#fafaf9";
  }
  return "#fafaf9";
}

function hexLuminance(hex: string): number | null {
  if (!hex.startsWith("#") || hex.length !== 7) {
    return null;
  }
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function separatorAlphas(
  resolved: ResolvedTheme,
  background?: string,
): { hair: number; ghost: number; rule: number; faint: number } {
  if (resolved === "dark") {
    const lum = background ? hexLuminance(background) : null;
    if (lum != null && lum > 0.22 && lum < 0.72) {
      return { hair: 0.06, ghost: 0.1, rule: 0.12, faint: 0.26 };
    }
    return { hair: 0.08, ghost: 0.12, rule: 0.16, faint: 0.3 };
  }
  return { hair: 0.1, ghost: 0.2, rule: 0.22, faint: 0.34 };
}

function inkTints(
  foreground: string,
  resolved: ResolvedTheme,
  background?: string,
): Pick<ThemeTokenMap, "--hair" | "--ghost" | "--rule" | "--faint"> {
  const alphas = separatorAlphas(resolved, background);
  if (foreground.startsWith("#")) {
    const r = Number.parseInt(foreground.slice(1, 3), 16);
    const g = Number.parseInt(foreground.slice(3, 5), 16);
    const b = Number.parseInt(foreground.slice(5, 7), 16);
    return {
      "--hair": `rgba(${r}, ${g}, ${b}, ${alphas.hair})`,
      "--ghost": `rgba(${r}, ${g}, ${b}, ${alphas.ghost})`,
      "--rule": `rgba(${r}, ${g}, ${b}, ${alphas.rule})`,
      "--faint": `rgba(${r}, ${g}, ${b}, ${alphas.faint})`,
    };
  }
  const base = foreground.replace(/\s*\/\s*[\d.]+\s*$/, "").trim();
  return {
    "--hair": `${base} / ${alphas.hair}`,
    "--ghost": `${base} / ${alphas.ghost}`,
    "--rule": `${base} / ${alphas.rule}`,
    "--faint": `${base} / ${alphas.faint}`,
  };
}

export function mergeCustomColors(
  base: ThemeTokenMap,
  custom: CustomThemeColors,
  resolved: ResolvedTheme,
): ThemeTokenMap {
  const next = { ...base };
  if (custom.background) {
    next["--background"] = custom.background;
    const elevated = deriveElevatedSurface(custom.background);
    if (elevated) {
      next["--card"] = elevated;
      next["--popover"] = elevated;
    }
  }
  if (custom.primary) {
    const fg = contrastForeground(custom.primary);
    next["--primary"] = custom.primary;
    next["--ring"] = custom.primary;
    next["--sidebar-primary"] = custom.primary;
    next["--primary-foreground"] = fg;
    next["--sidebar-primary-foreground"] = fg;
  }
  if (custom.secondary) {
    next["--secondary"] = custom.secondary;
    next["--secondary-foreground"] = contrastForeground(custom.secondary);
  }
  if (custom.tertiary) {
    next["--accent"] = custom.tertiary;
    next["--accent-foreground"] = contrastForeground(custom.tertiary);
  }
  const foreground = next["--foreground"] ?? base["--foreground"];
  if (foreground) {
    Object.assign(
      next,
      inkTints(foreground, resolved, next["--background"]),
    );
  }
  return next;
}

export function buildThemeTokens(
  paletteId: PaletteId,
  resolved: ResolvedTheme,
  custom: CustomThemeColors,
): ThemeTokenMap {
  const base = getPresetTokens(paletteId, resolved);
  const merged =
    paletteId === "custom"
      ? mergeCustomColors(base, custom, resolved)
      : { ...base };
  const foreground = merged["--foreground"];
  if (foreground) {
    return {
      ...merged,
      ...inkTints(foreground, resolved, merged["--background"]),
    };
  }
  return merged;
}

export function clearPaletteOverrides(root: HTMLElement) {
  for (const key of MANAGED_KEYS) {
    root.style.removeProperty(key);
  }
}

const FONT_LINK_ID = "tudu-theme-font-link";

function ensureWebFont(fontId: FontId) {
  if (typeof document === "undefined") {
    return;
  }
  if (fontId === "system") {
    return;
  }
  const href =
    fontId === "archivo"
      ? "https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,400..700;1,400..700&display=swap"
      : "https://fonts.googleapis.com/css2?family=AR+One+Sans:ital,wght@0,400..700;1,400..700&display=swap";
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) {
    link.href = href;
  }
}

export function applyPaletteToDocument(
  paletteId: PaletteId,
  resolved: ResolvedTheme,
  custom: CustomThemeColors,
  fontId: FontId,
) {
  if (typeof document === "undefined") {
    return;
  }
  ensureWebFont(fontId);
  const root = document.documentElement;
  clearPaletteOverrides(root);

  if (paletteId === "current" && Object.keys(custom).length === 0) {
    root.style.setProperty("--font-sans", FONT_STACKS[fontId]);
    return;
  }

  const tokens = buildThemeTokens(paletteId, resolved, custom);
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
  root.style.setProperty("--font-sans", FONT_STACKS[fontId]);
}

export function themeColorFromTokens(tokens: ThemeTokenMap): string {
  const bg = tokens["--background"];
  if (bg?.startsWith("#")) {
    return bg;
  }
  return resolvedFallbackHex(bg);
}

function resolvedFallbackHex(background: string | undefined): string {
  if (!background) {
    return "#111111";
  }
  return "#111111";
}
