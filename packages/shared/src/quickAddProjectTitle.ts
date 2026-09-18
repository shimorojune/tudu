/** Remove a matched project name (and common suffixes) from a task title once. */
export function stripProjectPhraseFromTitle(
  title: string,
  projectName: string,
): string {
  const trimmed = title.trim();
  if (!trimmed || !projectName.trim()) {
    return trimmed;
  }

  const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\bin\\s+the\\s+${escaped}\\s+project\\b`, "i"),
    new RegExp(`\\b${escaped}\\s+project\\b`, "i"),
    new RegExp(`\\bfor\\s+${escaped}\\b`, "i"),
    new RegExp(`\\b${escaped}\\b`, "i"),
  ];

  let next = trimmed;
  for (const pattern of patterns) {
    if (pattern.test(next)) {
      next = next.replace(pattern, " ");
      break;
    }
  }

  return next.replace(/\s+/g, " ").trim();
}
