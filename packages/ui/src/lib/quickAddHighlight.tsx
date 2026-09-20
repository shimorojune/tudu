import type { QuickAddTextSpan } from "@tudu/shared";
import type { ReactNode } from "react";

export function renderQuickAddHighlightedTitle(
  text: string,
  spans: QuickAddTextSpan[],
): ReactNode {
  if (spans.length === 0 || text.length === 0) {
    return text;
  }

  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const span of sorted) {
    if (span.start > cursor) {
      nodes.push(text.slice(cursor, span.start));
    }
    nodes.push(
      <span key={`${span.start}-${span.end}`} className="text-primary-text">
        {text.slice(span.start, span.end)}
      </span>,
    );
    cursor = span.end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}
