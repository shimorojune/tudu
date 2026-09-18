import * as chrono from "chrono-node";

export type QuickAddDayChoice = "today" | "tomorrow" | "pick" | "unscheduled";

export type QuickAddTextSpan = {
  start: number;
  end: number;
};

export type QuickAddNaturalLanguageParse = {
  spans: QuickAddTextSpan[];
  scheduledDate: string | null;
  dayChoice: QuickAddDayChoice;
  pickedDate: string;
  chipLabel: string | null;
  titleForSave: string;
};

function isoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetIso(fromIso: string, dayOffset: number): string {
  const date = new Date(`${fromIso}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  return isoDateLocal(date);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function mergeSpans(spans: QuickAddTextSpan[]): QuickAddTextSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: QuickAddTextSpan[] = [];

  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (!last || span.start > last.end) {
      merged.push({ ...span });
      continue;
    }
    last.end = Math.max(last.end, span.end);
  }

  return merged;
}

function stripSpans(input: string, spans: QuickAddTextSpan[]): string {
  if (spans.length === 0) {
    return normalizeWhitespace(input);
  }

  let result = "";
  let cursor = 0;

  for (const span of spans) {
    result += input.slice(cursor, span.start);
    cursor = span.end;
  }

  result += input.slice(cursor);
  return normalizeWhitespace(result);
}

function formatChipLabel(start: Date, todayIso: string): string {
  const dateIso = isoDateLocal(start);
  const tomorrowIso = offsetIso(todayIso, 1);

  let dayPart: string;
  if (dateIso === todayIso) {
    dayPart = "Today";
  } else if (dateIso === tomorrowIso) {
    dayPart = "Tomorrow";
  } else {
    dayPart = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  const hasTime =
    start.getHours() !== 0 ||
    start.getMinutes() !== 0 ||
    start.getSeconds() !== 0;

  if (!hasTime) {
    return dayPart;
  }

  const timePart = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dayPart}, ${timePart}`;
}

function deriveDayChoice(
  scheduledDate: string | null,
  todayIso: string,
): { dayChoice: QuickAddDayChoice; pickedDate: string } {
  if (scheduledDate === null) {
    return { dayChoice: "unscheduled", pickedDate: todayIso };
  }

  if (scheduledDate === todayIso) {
    return { dayChoice: "today", pickedDate: todayIso };
  }

  if (scheduledDate === offsetIso(todayIso, 1)) {
    return { dayChoice: "tomorrow", pickedDate: scheduledDate };
  }

  return { dayChoice: "pick", pickedDate: scheduledDate };
}

/** Parse natural-language dates in Quick Add input (chrono-node). */
export function parseQuickAddNaturalLanguage(
  input: string,
  refDate: Date,
  todayIso: string,
): QuickAddNaturalLanguageParse {
  const trimmed = input.trim();
  const empty: QuickAddNaturalLanguageParse = {
    spans: [],
    scheduledDate: null,
    dayChoice: "unscheduled",
    pickedDate: todayIso,
    chipLabel: null,
    titleForSave: "",
  };

  if (trimmed.length === 0) {
    return empty;
  }

  const results = chrono.parse(trimmed, refDate, { forwardDate: true });

  if (results.length === 0) {
    return {
      ...empty,
      dayChoice: "unscheduled",
      titleForSave: trimmed,
    };
  }

  const primary = results[0];
  const start = primary.start.date();
  const scheduledDate = isoDateLocal(start);

  const spans = mergeSpans(
    results.map((result) => ({
      start: result.index,
      end: result.index + result.text.length,
    })),
  );

  const titleForSave = stripSpans(trimmed, spans);
  const { dayChoice, pickedDate } = deriveDayChoice(scheduledDate, todayIso);

  return {
    spans,
    scheduledDate,
    dayChoice,
    pickedDate,
    chipLabel: formatChipLabel(start, todayIso),
    titleForSave: titleForSave.length > 0 ? titleForSave : trimmed,
  };
}
