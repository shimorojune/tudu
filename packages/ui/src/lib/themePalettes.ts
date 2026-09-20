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

type PresetCore = {
  "--background": string;
  "--card": string;
  "--sidebar": string;
  "--foreground": string;
  "--muted-foreground": string;
  "--border": string;
  "--primary": string;
  "--primary-foreground": string;
  "--primary-text": string;
};

function parseHex(hex: string): [number, number, number] | null {
  const normalized = hex.trim();
  if (!normalized.startsWith("#") || normalized.length !== 7) {
    return null;
  }
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mix foreground into background; ratio is foreground weight 0..1. */
function mixHex(background: string, foreground: string, fgRatio: number): string {
  const bg = parseHex(background);
  const fg = parseHex(foreground);
  if (!bg || !fg) {
    return background;
  }
  const t = Math.min(1, Math.max(0, fgRatio));
  const inv = 1 - t;
  return toHex(
    bg[0] * inv + fg[0] * t,
    bg[1] * inv + fg[1] * t,
    bg[2] * inv + fg[2] * t,
  );
}

function separatorTints(
  foreground: string,
  resolved: ResolvedTheme,
): Pick<ThemeTokenMap, "--hair" | "--ghost" | "--rule"> {
  const fg = parseHex(foreground);
  if (!fg) {
    return { "--hair": foreground, "--ghost": foreground, "--rule": foreground };
  }
  const [r, g, b] = fg;
  if (resolved === "dark") {
    return {
      "--hair": `rgba(${r}, ${g}, ${b}, 0.08)`,
      "--ghost": `rgba(${r}, ${g}, ${b}, 0.12)`,
      "--rule": `rgba(${r}, ${g}, ${b}, 0.16)`,
    };
  }
  return {
    "--hair": `rgba(${r}, ${g}, ${b}, 0.1)`,
    "--ghost": `rgba(${r}, ${g}, ${b}, 0.2)`,
    "--rule": `rgba(${r}, ${g}, ${b}, 0.22)`,
  };
}

function expandPresetCore(core: PresetCore, resolved: ResolvedTheme): ThemeTokenMap {
  const bg = core["--background"];
  const card = core["--card"];
  const ink = core["--foreground"];
  const muted = core["--muted-foreground"];
  const border = core["--border"];
  const primary = core["--primary"];
  const primaryText = core["--primary-text"];
  const sidebar = core["--sidebar"];

  const stepped = mixHex(bg, ink, resolved === "dark" ? 0.12 : 0.06);
  const accent = mixHex(bg, primary, 0.08);
  const tintAlpha = resolved === "dark" ? 0.06 : 0.035;
  const fg = parseHex(ink);
  const tint =
    fg != null
      ? `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, ${tintAlpha})`
      : ink;

  const destructive =
    resolved === "dark" ? "#ff563c" : "#dd2b0f";
  const destructiveForeground =
    resolved === "dark" ? ink : core["--primary-foreground"];

  return {
    "--background": bg,
    "--foreground": ink,
    "--card": card,
    "--card-foreground": ink,
    "--popover": card,
    "--popover-foreground": ink,
    "--primary": primary,
    "--primary-foreground": core["--primary-foreground"],
    "--primary-text": primaryText,
    "--secondary": stepped,
    "--secondary-foreground": ink,
    "--muted": stepped,
    "--muted-foreground": muted,
    "--accent": accent,
    "--accent-foreground": primaryText,
    "--destructive": destructive,
    "--destructive-foreground": destructiveForeground,
    "--border": border,
    "--input": border,
    "--ring": primary,
    "--faint": muted,
    "--tint": tint,
    "--sidebar": sidebar,
    "--sidebar-foreground": ink,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": core["--primary-foreground"],
    "--sidebar-accent": stepped,
    "--sidebar-accent-foreground": ink,
    "--sidebar-border": border,
    "--sidebar-ring": primary,
    ...separatorTints(ink, resolved),
  };
}

const MODERNIST_CORE: { light: PresetCore; dark: PresetCore } = {
  light: {
    "--background": "#f3f2f2",
    "--card": "#fdfcfb",
    "--sidebar": "#eceae8",
    "--foreground": "#201e1d",
    "--muted-foreground": "#6b6767",
    "--border": "#d7d3d3",
    "--primary": "#ec3013",
    "--primary-foreground": "#fdfcfb",
    "--primary-text": "#ae1800",
  },
  dark: {
    "--background": "#302d2a",
    "--card": "#3a3733",
    "--sidebar": "#3d3833",
    "--foreground": "#f0ede8",
    "--muted-foreground": "#b5afab",
    "--border": "#4a4641",
    "--primary": "#ec3013",
    "--primary-foreground": "#fdfcfb",
    "--primary-text": "#ff9783",
  },
};

const GITHUB_CORE: { light: PresetCore; dark: PresetCore } = {
  light: {
    "--background": "#f0f1f0",
    "--card": "#ffffff",
    "--sidebar": "#e7e9e7",
    "--foreground": "#1f2328",
    "--muted-foreground": "#5f6771",
    "--border": "#d3d7d5",
    "--primary": "#ec3013",
    "--primary-foreground": "#ffffff",
    "--primary-text": "#ab1c05",
  },
  dark: {
    "--background": "#0d1117",
    "--card": "#161b22",
    "--sidebar": "#010409",
    "--foreground": "#e6edf3",
    "--muted-foreground": "#8b949e",
    "--border": "#30363d",
    "--primary": "#ec3013",
    "--primary-foreground": "#ffffff",
    "--primary-text": "#ff8367",
  },
};

const NEUTRAL_CORE: { light: PresetCore; dark: PresetCore } = {
  light: {
    "--background": "#fafafa",
    "--card": "#ffffff",
    "--sidebar": "#fafafa",
    "--foreground": "#1a1a1a",
    "--muted-foreground": "#6b6b6b",
    "--border": "#e0e0e0",
    "--primary": "#ec3013",
    "--primary-foreground": "#ffffff",
    "--primary-text": "#b01e02",
  },
  dark: {
    "--background": "#171717",
    "--card": "#1c1c1c",
    "--sidebar": "#171717",
    "--foreground": "#f2f2f2",
    "--muted-foreground": "#a1a1a1",
    "--border": "#303030",
    "--primary": "#ec3013",
    "--primary-foreground": "#ffffff",
    "--primary-text": "#ff8b73",
  },
};

function tokensFromCore(
  coreSet: { light: PresetCore; dark: PresetCore },
  resolved: ResolvedTheme,
): ThemeTokenMap {
  const core = resolved === "dark" ? coreSet.dark : coreSet.light;
  return expandPresetCore(core, resolved);
}

const modernistLight = tokensFromCore(MODERNIST_CORE, "light");
const modernistDark = tokensFromCore(MODERNIST_CORE, "dark");
const githubLight = tokensFromCore(GITHUB_CORE, "light");
const githubDark = tokensFromCore(GITHUB_CORE, "dark");
const neutralLight = tokensFromCore(NEUTRAL_CORE, "light");
const neutralDark = tokensFromCore(NEUTRAL_CORE, "dark");

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
    light: githubLight,
    dark: githubDark,
  },
  current: {
    label: "Modernist",
    light: modernistLight,
    dark: modernistDark,
  },
  neutral: {
    label: "Neutral",
    light: neutralLight,
    dark: neutralDark,
  },
};

/** Preset ids shown in settings (excludes legacy `current`). */
export const VISIBLE_PALETTE_IDS: Exclude<PaletteId, "custom" | "current">[] = [
  "modernist",
  "github",
  "neutral",
];

/** Mini swatches for settings (fixed; not tied to html.dark). */
export const PALETTE_PREVIEW_SWATCH: Record<
  Exclude<PaletteId, "custom" | "current">,
  { light: string; dark: string; accent: string }
> = {
  modernist: { light: "#f3f2f2", dark: "#302d2a", accent: "#ec3013" },
  github: { light: "#f0f1f0", dark: "#0d1117", accent: "#ec3013" },
  neutral: { light: "#fafafa", dark: "#171717", accent: "#ec3013" },
};

export const FONT_STACKS: Record<FontId, string> = {
  archivo: "Archivo, system-ui, sans-serif",
  "ar-one-sans": '"AR One Sans", ui-sans-serif, sans-serif, system-ui',
  system: "system-ui, sans-serif",
};

export function normalizePaletteId(paletteId: PaletteId): PaletteId {
  if (paletteId === "current") {
    return "modernist";
  }
  return paletteId;
}

export function getPresetTokens(
  paletteId: PaletteId,
  resolved: ResolvedTheme,
): ThemeTokenMap {
  const id = normalizePaletteId(paletteId);
  if (id === "custom") {
    return PALETTE_PRESETS.modernist[resolved];
  }
  return PALETTE_PRESETS[id][resolved];
}
