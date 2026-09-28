export type OrgNavSegment =
  | "today"
  | "week"
  | "requests"
  | "unscheduled"
  | "coworkers"
  | "admin";

export function parseOrgSlugFromPath(pathname: string): string | null {
  const match = /^\/o\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

/** Routes that belong to the personal space (not org-prefixed). */
export function isPersonalSpacePath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/week") {
    return true;
  }
  if (pathname === "/requests" || pathname === "/unscheduled") {
    return true;
  }
  return false;
}

/** Routes that keep the last active space in chrome (settings, project detail). */
export function isSpaceNeutralPath(pathname: string): boolean {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return true;
  }
  if (/^\/projects\/[^/]+/.test(pathname)) {
    return true;
  }
  return false;
}

export function orgNavPath(
  orgSlug: string,
  segment: Exclude<OrgNavSegment, "today">,
): string {
  return `/o/${orgSlug}/${segment}`;
}

export function personalNavPath(
  segment: "week" | "requests" | "unscheduled",
): string {
  if (segment === "week") {
    return "/week";
  }
  return `/${segment}`;
}

export function isOrgAdminPath(pathname: string): boolean {
  return /\/admin\/?$/.test(pathname);
}

export function isCoworkersPath(pathname: string): boolean {
  return /\/coworkers\/?$/.test(pathname);
}

export function isRequestsPath(pathname: string): boolean {
  return pathname === "/requests" || /\/requests\/?$/.test(pathname);
}

export function joinCodeFromInput(raw: string): string {
  const trimmed = raw.trim();
  const deep = trimmed.match(/tudu:\/\/join\/([^/?#]+)/i);
  if (deep?.[1]) {
    return deep[1];
  }
  const web = trimmed.match(/\/join\/([^/?#]+)/i);
  if (web?.[1]) {
    return web[1];
  }
  return trimmed;
}

export function inviteTokenFromInput(raw: string): string {
  const trimmed = raw.trim();
  const deep = trimmed.match(/tudu:\/\/invite\/([^/?#]+)/i);
  if (deep?.[1]) {
    return deep[1];
  }
  const web = trimmed.match(/\/invite\/([^/?#]+)/i);
  if (web?.[1]) {
    return web[1];
  }
  return trimmed;
}
