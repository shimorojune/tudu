export function isWeekPath(pathname: string): boolean {
  return (
    pathname === "/week" ||
    pathname.startsWith("/week/") ||
    /\/o\/[^/]+\/week\/?$/.test(pathname)
  );
}
