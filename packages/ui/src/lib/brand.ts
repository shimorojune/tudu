import type { ProjectColor } from "@tudu/shared";
import { SPACE_COLOR_HEX } from "@tudu/shared";

/** Tudu brand colors and mark geometry from assets/tokens.json */

export const TUDU_ACCENT_RGB: [number, number, number] = [236, 48, 19];

export const TUDU_WARM_PALETTE: [number, number, number][] = [
  [236, 48, 19],
  [221, 43, 15],
  [255, 86, 60],
  [255, 151, 131],
  [255, 196, 184],
  [255, 224, 217],
];

export const TUDU_FULL_PALETTE: [number, number, number][] = [
  [236, 48, 19],
  [221, 43, 15],
  [255, 86, 60],
  [255, 151, 131],
  [240, 237, 232],
  [174, 24, 0],
  [96, 20, 5],
  [48, 23, 14],
  [32, 29, 42],
];

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}

export const PROJECT_COLOR_RGB: Record<ProjectColor, [number, number, number]> =
  Object.fromEntries(
    Object.entries(SPACE_COLOR_HEX).map(([name, hex]) => [
      name,
      hexToRgb(hex),
    ]),
  ) as Record<ProjectColor, [number, number, number]>;

export function projectColorCss(color: ProjectColor): string {
  const [red, green, blue] = PROJECT_COLOR_RGB[color];
  return `rgb(${red} ${green} ${blue})`;
}

/** Mark T geometry scaled to a 64×64 viewBox (from assets/tudu-mark.svg). */
export const TUDU_T_PATH = "M11.52 16.64H52.48V26.88H37.12V49.76H26.88V26.88H11.52Z";

export const TUDU_MARK_VIEWBOX = 64;
