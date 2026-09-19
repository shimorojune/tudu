import * as chrono from "chrono-node";
import {
  deadlineFromChronoDate,
  isoDateLocal,
  startDateFromChronoDate,
} from "./taskScheduleHelpers.js";

export type QuickAddDayChoice = "today" | "tomorrow" | "pick" | "unscheduled";

export type QuickAddTextSpan = {
  start: number;
  end: number;
};

export type QuickAddNaturalLanguageParse = {
  spans: QuickAddTextSpan[];
  scheduledDate: string | null;
  startDate: string | null;
  deadline: string | null;
  dayChoice: QuickAddDayChoice;
  pickedDate: string;
  chipLabel: string | null;
  titleForSave: string;
};

type ChronoRole = "schedule" | "start" | "deadline";

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

function chronoDateHasTime(date: Date): boolean {
  return (
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0
  );
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

  if (!chronoDateHasTime(start)) {
    return dayPart;
  }

  const timePart = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dayPart}, ${timePart}`;
}

export function inferScheduledDateFromTiming(
  scheduledDate: string | null,
  startDate: string | null,
  deadline: string | null,
): string | null {
  if (scheduledDate !== null) {
    return scheduledDate;
  }
  if (deadline) {
    return isoDateLocal(new Date(deadline));
  }
  if (startDate) {
    return startDate;
  }
  return null;
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

function roleForChronoMatch(text: string, index: number): ChronoRole {
  const before = text.slice(0, index).toLowerCase();
  const tail = before.slice(Math.max(0, before.length - 56));
  if (/\b(due|by|before)\b/.test(tail)) {
    return "deadline";
  }
  if (/\b(starting|start|from)\b/.test(tail)) {
    return "start";
  }
  return "schedule";
}

function spanWithRoleKeyword(
  text: string,
  span: QuickAddTextSpan,
  role: ChronoRole,
): QuickAddTextSpan {
  if (role === "schedule") {
    return span;
  }
  const before = text.slice(0, span.start);
  const keywordMatch = before.match(/\b(due|by|before|starting|start|from)\b\s*$/i);
  if (!keywordMatch) {
    return span;
  }
  return {
    start: span.start - keywordMatch[0].length,
    end: span.end,
  };
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
    startDate: null,
    deadline: null,
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

  let scheduledDate: string | null = null;
  let startDate: string | null = null;
  let deadline: string | null = null;
  let chipSource: Date | null = null;

  const spanByResult = results.map((result) => {
    const role = roleForChronoMatch(trimmed, result.index);
    const base = {
      start: result.index,
      end: result.index + result.text.length,
    };
    return {
      role,
      span: spanWithRoleKeyword(trimmed, base, role),
      when: result.start.date(),
    };
  });

  for (const { role, when } of spanByResult) {

    if (role === "deadline") {
      deadline = deadlineFromChronoDate(when);
      chipSource = chipSource ?? when;
      continue;
    }

    if (role === "start") {
      startDate = startDateFromChronoDate(when);
      chipSource = chipSource ?? when;
      continue;
    }

    if (scheduledDate === null) {
      scheduledDate = isoDateLocal(when);
      chipSource = when;
      if (chronoDateHasTime(when) && deadline === null) {
        deadline = deadlineFromChronoDate(when);
      }
    }
  }

  const spans = mergeSpans(spanByResult.map((entry) => entry.span));

  const titleForSave = stripSpans(trimmed, spans);
  scheduledDate = inferScheduledDateFromTiming(
    scheduledDate,
    startDate,
    deadline,
  );
  const { dayChoice, pickedDate } = deriveDayChoice(scheduledDate, todayIso);

  return {
    spans,
    scheduledDate,
    startDate,
    deadline,
    dayChoice,
    pickedDate,
    chipLabel: chipSource ? formatChipLabel(chipSource, todayIso) : null,
    titleForSave: titleForSave.length > 0 ? titleForSave : trimmed,
  };
}
