export const QUICK_ADD_NOTE_LINE_CAP = 3;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function quickAddNoteLineCount(note: string): number {
  if (!note.trim()) {
    return 0;
  }
  return note.split("\n").length;
}

export function quickAddNoteAtLineCap(note: string): boolean {
  return quickAddNoteLineCount(note) >= QUICK_ADD_NOTE_LINE_CAP;
}

export function plainQuickAddNoteToDescriptionHtml(note: string): string | null {
  const trimmed = note.trim();
  if (!trimmed) {
    return null;
  }
  const lines = trimmed.split("\n");
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

export function appendBlobImageToDescriptionHtml(
  descriptionHtml: string | null,
  blobUrl: string,
  fileName: string,
): string {
  const name = escapeHtml(fileName);
  const fragment = `<p><img src="${blobUrl}" alt="${name}"></p>`;
  const trimmed = descriptionHtml?.trim();
  if (!trimmed || trimmed === "<p></p>") {
    return fragment;
  }
  return `${trimmed}${fragment}`;
}
