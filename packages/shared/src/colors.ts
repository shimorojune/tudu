/** Twelve named space colours from design Board 8. Used for orgs and projects. */
export const SPACE_COLOR_NAMES = [
  "vermilion",
  "amber",
  "ochre",
  "moss",
  "jade",
  "teal",
  "cobalt",
  "iris",
  "plum",
  "rose",
  "graphite",
  "ink",
] as const;

export type SpaceColor = (typeof SPACE_COLOR_NAMES)[number];

export const SPACE_COLOR_HEX: Record<SpaceColor, string> = {
  vermilion: "#ec3013",
  amber: "#c9700c",
  ochre: "#a8841a",
  moss: "#5f8a2e",
  jade: "#25875f",
  teal: "#1d8185",
  cobalt: "#2c68c9",
  iris: "#5a52c4",
  plum: "#8f4aa3",
  rose: "#c43d76",
  graphite: "#6b6767",
  ink: "#201e1d",
};

export const DEFAULT_ORG_COLOR: SpaceColor = "vermilion";

/** Legacy project_color to space_color (migration and display). */
export const LEGACY_PROJECT_COLOR_MAP: Record<string, SpaceColor> = {
  ember: "vermilion",
  rust: "rose",
  clay: "amber",
  ink: "ink",
  stone: "graphite",
  moss: "moss",
};

export function mapLegacyProjectColor(legacy: string): SpaceColor {
  return LEGACY_PROJECT_COLOR_MAP[legacy] ?? "vermilion";
}

export function nextFreeColor(used: SpaceColor[]): SpaceColor {
  for (const name of SPACE_COLOR_NAMES) {
    if (!used.includes(name)) {
      return name;
    }
  }
  const index = used.length % SPACE_COLOR_NAMES.length;
  return SPACE_COLOR_NAMES[index]!;
}

export type ColorClash = {
  color: SpaceColor;
  shortCode: string;
};

export function clashesForColor(
  color: SpaceColor,
  projects: { color: SpaceColor; shortCode: string }[],
): ColorClash[] {
  return projects.filter((project) => project.color === color);
}
