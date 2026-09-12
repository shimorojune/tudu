export function reportUserIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/team\/([^/]+)(?:\/(week|inbox))?$/);
  return match?.[1] ?? null;
}

export function isWeekPath(pathname: string): boolean {
  return pathname === "/week" || /^\/team\/[^/]+\/week$/.test(pathname);
}
