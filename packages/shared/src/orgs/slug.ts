const MAX_SLUG_LEN = 40;

export function slugify(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const base = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, "");

  if (!base || !/[a-z0-9]/.test(base)) {
    return "org";
  }
  return base;
}

export function withCollisionSuffix(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (n < 1000) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG_LEN - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
    n += 1;
  }
  throw new Error("Could not allocate slug");
}
