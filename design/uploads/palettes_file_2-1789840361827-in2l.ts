import type { ResolvedTheme } from "@/lib/theme";

export type PaletteId = "modernist" | "github" | "current" | "neutral" | "custom";

export type FontId = "archivo" | "ar-one-sans" | "system";

export type CustomThemeColors = {
  primary?: string;
  secondary?: string;
  tertiary?: string;
  background?: string;
};

export type ThemeTokenMap = Record<string, string>;

const modernistLight: ThemeTokenMap = {
  "--background": "#f3f2f2",
  "--foreground": "#201e1d",
  "--card": "#fdfcfb",
  "--card-foreground": "#201e1d",
  "--popover": "#fdfcfb",
  "--popover-foreground": "#201e1d",
  "--primary": "#ec3013",
  "--primary-foreground": "#fdfcfb",
  "--secondary": "#eae9e9",
  "--secondary-foreground": "#201e1d",
  "--muted": "#eae9e9",
  "--muted-foreground": "#7d7979",
  "--accent": "#fff2ef",
  "--accent-foreground": "#ae1800",
  "--destructive": "#dd2b0f",
  "--destructive-foreground": "#fdfcfb",
  "--border": "#d7d3d3",
  "--input": "#bab6b6",
  "--ring": "#ec3013",
  "--sidebar": "#eceae8",
  "--sidebar-foreground": "#201e1d",
  "--sidebar-primary": "#ec3013",
  "--sidebar-primary-foreground": "#fdfcfb",
  "--sidebar-accent": "#eae9e9",
  "--sidebar-accent-foreground": "#201e1d",
  "--sidebar-border": "#d7d3d3",
  "--sidebar-ring": "#ec3013",
};

const modernistDark: ThemeTokenMap = {
  "--background": "#302d2a",
  "--foreground": "#f0ede8",
  "--card": "#3a3733",
  "--card-foreground": "#f0ede8",
  "--popover": "#3a3733",
  "--popover-foreground": "#f0ede8",
  "--primary": "#ec3013",
  "--primary-foreground": "#fdfcfb",
  "--secondary": "#44403b",
  "--secondary-foreground": "#f0ede8",
  "--muted": "#44403b",
  "--muted-foreground": "#a8a29e",
  "--accent": "#4d170e",
  "--accent-foreground": "#ffc4b8",
  "--destructive": "#ff563c",
  "--destructive-foreground": "#201e1d",
  "--border": "#4a4641",
  "--input": "#5a554f",
  "--ring": "#ec3013",
  "--sidebar": "#3d3833",
  "--sidebar-foreground": "#f0ede8",
  "--sidebar-primary": "#ec3013",
  "--sidebar-primary-foreground": "#fdfcfb",
  "--sidebar-accent": "#44403b",
  "--sidebar-accent-foreground": "#f0ede8",
  "--sidebar-border": "#4a4641",
  "--sidebar-ring": "#ec3013",
};

const githubDark: ThemeTokenMap = {
  "--background": "#0d1117",
  "--foreground": "#e6edf3",
  "--card": "#161b22",
  "--card-foreground": "#e6edf3",
  "--popover": "#161b22",
  "--popover-foreground": "#e6edf3",
  "--primary": "#ec3013",
  "--primary-foreground": "#ffffff",
  "--secondary": "#21262d",
  "--secondary-foreground": "#e6edf3",
  "--muted": "#21262d",
  "--muted-foreground": "#7d8590",
  "--accent": "#21262d",
  "--accent-foreground": "#ffc4b8",
  "--destructive": "#f85149",
  "--destructive-foreground": "#ffffff",
  "--border": "#30363d",
  "--input": "#30363d",
  "--ring": "#ec3013",
  "--sidebar": "#010409",
  "--sidebar-foreground": "#e6edf3",
  "--sidebar-primary": "#ec3013",
  "--sidebar-primary-foreground": "#ffffff",
  "--sidebar-accent": "#21262d",
  "--sidebar-accent-foreground": "#e6edf3",
  "--sidebar-border": "#30363d",
  "--sidebar-ring": "#ec3013",
};

const currentLight: ThemeTokenMap = {
  "--background": "oklch(0.9821 0 0)",
  "--foreground": "oklch(0.2435 0 0)",
  "--card": "oklch(0.9911 0 0)",
  "--card-foreground": "oklch(0.2435 0 0)",
  "--popover": "oklch(0.9911 0 0)",
  "--popover-foreground": "oklch(0.2435 0 0)",
  "--primary": "oklch(0.4341 0.0392 41.9938)",
  "--primary-foreground": "oklch(1.0000 0 0)",
  "--secondary": "oklch(0.9200 0.0651 74.3695)",
  "--secondary-foreground": "oklch(0.3499 0.0685 40.8288)",
  "--muted": "oklch(0.9521 0 0)",
  "--muted-foreground": "oklch(0.5032 0 0)",
  "--accent": "oklch(0.9310 0 0)",
  "--accent-foreground": "oklch(0.2435 0 0)",
  "--destructive": "oklch(0.6271 0.1936 33.3390)",
  "--destructive-foreground": "oklch(1.0000 0 0)",
  "--border": "oklch(0.8822 0 0)",
  "--input": "oklch(0.8822 0 0)",
  "--ring": "oklch(0.4341 0.0392 41.9938)",
  "--sidebar": "oklch(0.9881 0 0)",
  "--sidebar-foreground": "oklch(0.2645 0 0)",
  "--sidebar-primary": "oklch(0.3250 0 0)",
  "--sidebar-primary-foreground": "oklch(0.9881 0 0)",
  "--sidebar-accent": "oklch(0.9761 0 0)",
  "--sidebar-accent-foreground": "oklch(0.3250 0 0)",
  "--sidebar-border": "oklch(0.9401 0 0)",
  "--sidebar-ring": "oklch(0.7731 0 0)",
};

const currentDark: ThemeTokenMap = {
  "--background": "oklch(0.1776 0 0)",
  "--foreground": "oklch(0.9491 0 0)",
  "--card": "oklch(0.2134 0 0)",
  "--card-foreground": "oklch(0.9491 0 0)",
  "--popover": "oklch(0.2134 0 0)",
  "--popover-foreground": "oklch(0.9491 0 0)",
  "--primary": "oklch(0.9247 0.0524 66.1732)",
  "--primary-foreground": "oklch(0.2029 0.0240 200.1962)",
  "--secondary": "oklch(0.3163 0.0190 63.6992)",
  "--secondary-foreground": "oklch(0.9247 0.0524 66.1732)",
  "--muted": "oklch(0.2520 0 0)",
  "--muted-foreground": "oklch(0.8200 0 0)",
  "--accent": "oklch(0.2850 0 0)",
  "--accent-foreground": "oklch(0.9491 0 0)",
  "--destructive": "oklch(0.6271 0.1936 33.3390)",
  "--destructive-foreground": "oklch(1.0000 0 0)",
  "--border": "oklch(0.2351 0.0115 91.7467)",
  "--input": "oklch(0.4017 0 0)",
  "--ring": "oklch(0.9247 0.0524 66.1732)",
  "--sidebar": "oklch(0.2103 0.0059 285.8852)",
  "--sidebar-foreground": "oklch(0.9674 0.0013 286.3752)",
  "--sidebar-primary": "oklch(0.4882 0.2172 264.3763)",
  "--sidebar-primary-foreground": "oklch(1.0000 0 0)",
  "--sidebar-accent": "oklch(0.2739 0.0055 286.0326)",
  "--sidebar-accent-foreground": "oklch(0.9674 0.0013 286.3752)",
  "--sidebar-border": "oklch(0.2739 0.0055 286.0326)",
  "--sidebar-ring": "oklch(0.8711 0.0055 286.2860)",
};

const neutralLight: ThemeTokenMap = {
  "--background": "oklch(0.98 0 0)",
  "--foreground": "oklch(0.2 0 0)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.2 0 0)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.2 0 0)",
  "--primary": "oklch(0.25 0 0)",
  "--primary-foreground": "oklch(0.98 0 0)",
  "--secondary": "oklch(0.94 0 0)",
  "--secondary-foreground": "oklch(0.25 0 0)",
  "--muted": "oklch(0.94 0 0)",
  "--muted-foreground": "oklch(0.5 0 0)",
  "--accent": "oklch(0.92 0 0)",
  "--accent-foreground": "oklch(0.25 0 0)",
  "--destructive": "oklch(0.55 0.2 25)",
  "--destructive-foreground": "oklch(1 0 0)",
  "--border": "oklch(0.88 0 0)",
  "--input": "oklch(0.88 0 0)",
  "--ring": "oklch(0.25 0 0)",
  "--sidebar": "oklch(0.97 0 0)",
  "--sidebar-foreground": "oklch(0.22 0 0)",
  "--sidebar-primary": "oklch(0.25 0 0)",
  "--sidebar-primary-foreground": "oklch(0.98 0 0)",
  "--sidebar-accent": "oklch(0.94 0 0)",
  "--sidebar-accent-foreground": "oklch(0.22 0 0)",
  "--sidebar-border": "oklch(0.9 0 0)",
  "--sidebar-ring": "oklch(0.25 0 0)",
};

const neutralDark: ThemeTokenMap = {
  "--background": "oklch(0.16 0 0)",
  "--foreground": "oklch(0.95 0 0)",
  "--card": "oklch(0.2 0 0)",
  "--card-foreground": "oklch(0.95 0 0)",
  "--popover": "oklch(0.2 0 0)",
  "--popover-foreground": "oklch(0.95 0 0)",
  "--primary": "oklch(0.92 0 0)",
  "--primary-foreground": "oklch(0.16 0 0)",
  "--secondary": "oklch(0.28 0 0)",
  "--secondary-foreground": "oklch(0.92 0 0)",
  "--muted": "oklch(0.24 0 0)",
  "--muted-foreground": "oklch(0.72 0 0)",
  "--accent": "oklch(0.3 0 0)",
  "--accent-foreground": "oklch(0.95 0 0)",
  "--destructive": "oklch(0.55 0.2 25)",
  "--destructive-foreground": "oklch(1 0 0)",
  "--border": "oklch(0.32 0 0)",
  "--input": "oklch(0.38 0 0)",
  "--ring": "oklch(0.92 0 0)",
  "--sidebar": "oklch(0.14 0 0)",
  "--sidebar-foreground": "oklch(0.93 0 0)",
  "--sidebar-primary": "oklch(0.92 0 0)",
  "--sidebar-primary-foreground": "oklch(0.14 0 0)",
  "--sidebar-accent": "oklch(0.28 0 0)",
  "--sidebar-accent-foreground": "oklch(0.93 0 0)",
  "--sidebar-border": "oklch(0.32 0 0)",
  "--sidebar-ring": "oklch(0.72 0 0)",
};

export const PALETTE_PRESETS: Record<
  Exclude<PaletteId, "custom">,
  { light: ThemeTokenMap; dark: ThemeTokenMap; label: string }
> = {
  modernist: {
    label: "Modernist",
    light: modernistLight,
    dark: modernistDark,
  },
  github: {
    label: "GitHub",
    light: modernistLight,
    dark: githubDark,
  },
  current: {
    label: "Current",
    light: currentLight,
    dark: currentDark,
  },
  neutral: {
    label: "Neutral",
    light: neutralLight,
    dark: neutralDark,
  },
};

/** Mini swatches for settings (fixed; not tied to html.dark). */
export const PALETTE_PREVIEW_SWATCH: Record<
  Exclude<PaletteId, "custom">,
  { light: string; dark: string; accent: string }
> = {
  modernist: { light: "#f3f2f2", dark: "#302d2a", accent: "#ec3013" },
  github: { light: "#f3f2f2", dark: "#0d1117", accent: "#ec3013" },
  current: { light: "#fafafa", dark: "#1a1a1a", accent: "#8b6914" },
  neutral: { light: "#fafafa", dark: "#1f1f1f", accent: "#333333" },
};

export const FONT_STACKS: Record<FontId, string> = {
  archivo: "Archivo, system-ui, sans-serif",
  "ar-one-sans": '"AR One Sans", ui-sans-serif, sans-serif, system-ui',
  system: "system-ui, sans-serif",
};

export function getPresetTokens(
  paletteId: PaletteId,
  resolved: ResolvedTheme,
): ThemeTokenMap {
  if (paletteId === "custom") {
    return PALETTE_PRESETS.current[resolved];
  }
  return PALETTE_PRESETS[paletteId][resolved];
}
