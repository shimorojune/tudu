export function personFirstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Someone";
  }
  return trimmed.split(/\s+/)[0]!;
}

export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}
