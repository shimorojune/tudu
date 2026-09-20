// Tudu theme presets — re-derived. One red across all three; presets differ by
// ground temperature, surface model and sidebar treatment.
// --primary is the fill red only. --primary-text is red as type, tuned per
// ground to hold 4.5:1.

export const PRESETS = {
  modernist: {
    label: "Modernist",
    character: "Warm stone · flat single ground · tinted rail",
    light: {
      "--canvas": "#f0eeec", "--background": "#f3f2f2", "--card": "#fdfcfb",
      "--sidebar": "#eceae8", "--foreground": "#201e1d", "--muted-foreground": "#6b6767",
      "--border": "#d7d3d3", "--primary": "#ec3013", "--primary-foreground": "#fdfcfb",
      "--primary-text": "#ae1800"
    },
    dark: {
      "--canvas": "#24211f", "--background": "#302d2a", "--card": "#3a3733",
      "--sidebar": "#3d3833", "--foreground": "#f0ede8", "--muted-foreground": "#b5afab",
      "--border": "#4a4641", "--primary": "#ec3013", "--primary-foreground": "#fdfcfb",
      "--primary-text": "#ff9783"
    }
  },
  github: {
    label: "GitHub",
    character: "Cool slate, warmed · raised cards over a darker canvas · deeper rail",
    light: {
      "--canvas": "#eceeec", "--background": "#f0f1f0", "--card": "#ffffff",
      "--sidebar": "#e7e9e7", "--foreground": "#1f2328", "--muted-foreground": "#5f6771",
      "--border": "#d3d7d5", "--primary": "#ec3013", "--primary-foreground": "#ffffff",
      "--primary-text": "#ab1c05"
    },
    dark: {
      "--canvas": "#05080c", "--background": "#0d1117", "--card": "#161b22",
      "--sidebar": "#010409", "--foreground": "#e6edf3", "--muted-foreground": "#8b949e",
      "--border": "#30363d", "--primary": "#ec3013", "--primary-foreground": "#ffffff",
      "--primary-text": "#ff8367"
    }
  },
  neutral: {
    label: "Neutral",
    character: "Pure grey · flat, cards read by rule not fill · rail same as page",
    light: {
      "--canvas": "#efefef", "--background": "#fafafa", "--card": "#ffffff",
      "--sidebar": "#fafafa", "--foreground": "#1a1a1a", "--muted-foreground": "#6b6b6b",
      "--border": "#e0e0e0", "--primary": "#ec3013", "--primary-foreground": "#ffffff",
      "--primary-text": "#b01e02"
    },
    dark: {
      "--canvas": "#0a0a0a", "--background": "#171717", "--card": "#1c1c1c",
      "--sidebar": "#171717", "--foreground": "#f2f2f2", "--muted-foreground": "#a1a1a1",
      "--border": "#303030", "--primary": "#ec3013", "--primary-foreground": "#ffffff",
      "--primary-text": "#ff8b73"
    }
  }
};

export const FONT_STACKS = {
  "ar-one-sans": '"AR One Sans",ui-sans-serif,sans-serif,system-ui',
  archivo: "Archivo,system-ui,sans-serif",
  system: "system-ui,sans-serif"
};

// Separator tints are derived from --foreground at fixed alphas, exactly as
// inkTints() does in themePalette.ts.
const ALPHAS = {
  light: { hair: 0.1, ghost: 0.2, rule: 0.22, faint: 0.34 },
  dark: { hair: 0.08, ghost: 0.12, rule: 0.16, faint: 0.3 }
};

export function tokensFor(presetId, mode) {
  const preset = PRESETS[presetId] ?? PRESETS.modernist;
  const base = preset[mode] ?? preset.light;
  const fg = base["--foreground"];
  const r = parseInt(fg.slice(1, 3), 16);
  const g = parseInt(fg.slice(3, 5), 16);
  const b = parseInt(fg.slice(5, 7), 16);
  const a = ALPHAS[mode] ?? ALPHAS.light;
  return {
    ...base,
    "--hair": `rgba(${r}, ${g}, ${b}, ${a.hair})`,
    "--ghost": `rgba(${r}, ${g}, ${b}, ${a.ghost})`,
    "--rule": `rgba(${r}, ${g}, ${b}, ${a.rule})`,
    // --faint is a TEXT colour (kickers, counts, captions). An alpha tint cannot
    // clear 4.5:1, and there is no room for a lighter step above --muted-foreground,
    // so de-emphasis below muted is not available at AA: it resolves to the same ink.
    "--faint": base["--muted-foreground"],
    "--tint": `rgba(${r}, ${g}, ${b}, ${mode === "dark" ? 0.06 : 0.035})`
  };
}
