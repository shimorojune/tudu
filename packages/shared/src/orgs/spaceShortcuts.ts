export type SpaceListEntry = {
  kind: "personal" | "org";
  orgId?: string;
  slug?: string;
};

export function spaceForShortcut(
  index: number,
  spaces: SpaceListEntry[],
): SpaceListEntry | null {
  const oneBased = index + 1;
  if (oneBased < 1 || oneBased > 9) {
    return null;
  }
  return spaces[oneBased - 1] ?? null;
}

export function shortcutLabel(
  index: number,
  platform: "mac" | "other",
): string {
  const n = index + 1;
  return platform === "mac" ? `Ctrl+${n}` : `Alt+${n}`;
}
