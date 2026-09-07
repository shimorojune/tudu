export type LinkifySegment =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function isSafeHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Split plain text into text and http(s) URL segments. Bare domains are ignored. */
export function linkifyText(text: string): LinkifySegment[] {
  if (!text) {
    return [];
  }

  const segments: LinkifySegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, index) });
    }

    if (isSafeHttpUrl(value)) {
      segments.push({ kind: "link", value, href: value });
    } else {
      segments.push({ kind: "text", value });
    }

    lastIndex = index + value.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    return [{ kind: "text", value: text }];
  }

  return segments;
}

export function linkHostname(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return href;
  }
}
