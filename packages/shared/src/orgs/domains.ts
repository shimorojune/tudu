const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeDomains(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const domain = raw.trim().toLowerCase().replace(/^@+/, "");
    if (!domain) {
      continue;
    }
    if (domain.includes("xn--") || domain.includes("..")) {
      throw new Error(`Invalid domain: ${raw}`);
    }
    if (!DOMAIN_RE.test(domain)) {
      throw new Error(`Invalid domain: ${raw}`);
    }
    if (!seen.has(domain)) {
      seen.add(domain);
      out.push(domain);
    }
  }
  return out;
}

export function emailAllowed(email: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) {
    return true;
  }
  const at = email.lastIndexOf("@");
  if (at < 0) {
    return false;
  }
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.includes(domain);
}
