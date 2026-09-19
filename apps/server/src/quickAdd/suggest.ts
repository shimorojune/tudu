import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Db, ProjectRow } from "@tudu/db";
import { listProjectsForUser } from "@tudu/db";
import {
  DEFAULT_NOW_SOFT_CAP,
  QUICK_ADD_BUCKET_CONFIDENCE_MIN,
  QUICK_ADD_DEADLINE_CONFIDENCE_MIN,
  QUICK_ADD_PROJECT_CONFIDENCE_MIN,
  QUICK_ADD_START_CONFIDENCE_MIN,
  deadlineFromLocalParts,
  isoDateLocal,
  validateStartBeforeDeadline,
  type Bucket,
  type QuickAddSuggestRequest,
  type QuickAddSuggestResponse,
} from "@tudu/shared";

export type QuickAddSuggestDeps = {
  db: Db;
  client: TypeSafeClient | null;
};

function offsetIso(fromIso: string, dayOffset: number): string {
  const date = new Date(`${fromIso}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  return isoDateLocal(date);
}

function endOfWeekIso(fromIso: string): string {
  const date = new Date(`${fromIso}T12:00:00`);
  const day = date.getDay();
  const daysUntilFriday = day <= 5 ? 5 - day : 5 + (7 - day);
  date.setDate(date.getDate() + (day === 5 ? 0 : daysUntilFriday));
  return isoDateLocal(date);
}

function projectCriteria(projects: ProjectRow[]) {
  const criteria: Record<string, string | null> = {
    none: "No project mentioned or implied in title or rawInput",
  };

  for (const project of projects) {
    criteria[project.id] =
      `Project "${project.name}": pick when the task clearly belongs to or mentions this name, team, or codebase`;
  }

  return criteria;
}

function bucketCriteria(scheduledDate: string, today: string) {
  const relative =
    scheduledDate === today
      ? "scheduled for today"
      : `scheduled for ${scheduledDate}`;

  return {
    now:
      `Priority 1 (${relative}). Must pick when urgency or top-of-day language appears: first thing, first up, ASAP, critical, urgent, important, must, before anything else, high priority, do not forget. Relative to ${relative}, not calendar today unless scheduled for today.`,
    next:
      `Priority 2 (${relative}). Default for normal same-day work when urgency language is weak or missing.`,
    later:
      `Priority 3 (${relative}). Pick for low priority: later, whenever, no rush, if time, someday, low priority.`,
  };
}

function startCriteria(today: string, scheduledDate: string | null) {
  const criteria: Record<string, string> = {
    none: "No implied start date in the title",
    today: `Work should start today (${today})`,
    tomorrow: `Work should start tomorrow (${offsetIso(today, 1)})`,
  };
  if (scheduledDate) {
    criteria.scheduled_day = `Work should start on the scheduled day (${scheduledDate})`;
  }
  criteria.next_monday =
    "Work should start next Monday or the next work week start implied by the title";
  return criteria;
}

function deadlineCriteria(today: string, scheduledDate: string | null) {
  const criteria: Record<string, string> = {
    none: "No implied deadline in the title",
    today_eod: "Due by end of today",
    tomorrow_eod: "Due by end of tomorrow",
    three_days: "Due within about three days",
    end_of_week: "Due by end of the work week (Friday)",
  };
  if (scheduledDate) {
    criteria.scheduled_eod = `Due by end of the scheduled day (${scheduledDate})`;
  }
  return criteria;
}

function mapStartChoice(
  choiceKey: string,
  today: string,
  scheduledDate: string | null,
): string | null {
  switch (choiceKey) {
    case "none":
      return null;
    case "today":
      return today;
    case "tomorrow":
      return offsetIso(today, 1);
    case "scheduled_day":
      return scheduledDate;
    case "next_monday": {
      const date = new Date(`${today}T12:00:00`);
      const day = date.getDay();
      const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : (8 - day) % 7;
      date.setDate(date.getDate() + (day === 1 ? 7 : daysUntilMonday));
      return isoDateLocal(date);
    }
    default:
      return null;
  }
}

function mapDeadlineChoice(
  choiceKey: string,
  today: string,
  scheduledDate: string | null,
): string | null {
  switch (choiceKey) {
    case "none":
      return null;
    case "today_eod":
      return deadlineFromLocalParts(today);
    case "tomorrow_eod":
      return deadlineFromLocalParts(offsetIso(today, 1));
    case "three_days":
      return deadlineFromLocalParts(offsetIso(today, 3));
    case "end_of_week":
      return deadlineFromLocalParts(endOfWeekIso(today));
    case "scheduled_eod":
      return scheduledDate ? deadlineFromLocalParts(scheduledDate) : null;
    default:
      return null;
  }
}

function acceptSuggestedDates(
  startDate: string | null,
  deadline: string | null,
): { startDate: string | null; deadline: string | null } {
  if (validateStartBeforeDeadline(startDate, deadline)) {
    return { startDate: null, deadline };
  }
  return { startDate, deadline };
}

export async function runQuickAddSuggest(
  deps: QuickAddSuggestDeps,
  userId: string,
  body: QuickAddSuggestRequest,
): Promise<QuickAddSuggestResponse> {
  const empty: QuickAddSuggestResponse = {
    projectId: null,
    bucket: null,
    matchedProjectName: null,
    startDate: null,
    deadline: null,
    confidence: null,
  };

  if (!deps.client) {
    return empty;
  }

  const projects = await listProjectsForUser(deps.db, userId);
  const scheduled = body.scheduledDate !== null;
  const needStart = !body.parsedStartDate;
  const needDeadline = !body.parsedDeadline;

  const questions: Record<string, ReturnType<typeof choice>> = {
    project: choice(
      "Pick exactly one project id from the criteria, or none. Use rawInput and title. Match project names, abbreviations, and clear work context. Prefer a listed project over none when reasonably implied.",
      projectCriteria(projects),
    ),
  };

  if (scheduled) {
    questions.bucket = choice(
      "Pick exactly one bucket for this scheduled task. Use title and rawInput urgency cues. Priority is relative to scheduledDate in state, not calendar today unless they match.",
      bucketCriteria(body.scheduledDate!, body.today),
    );
  }

  if (needStart) {
    questions.start = choice(
      "Pick a start date only when the title implies when work should begin (before the demo, next sprint, not before Monday). If chrono already parsed a start, prefer none.",
      startCriteria(body.today, body.scheduledDate),
    );
  }

  if (needDeadline) {
    questions.deadline = choice(
      "Pick a deadline only when the title implies a due time (before launch, end of sprint, EOD). If chrono already parsed a deadline, prefer none.",
      deadlineCriteria(body.today, body.scheduledDate),
    );
  }

  const { answers } = await deps.client.systemOne({
    state: {
      task: "Classify Quick Add defaults for project, bucket, start, and deadline.",
      rules: [
        "Always choose the single best project and bucket labels.",
        "Bucket now means highest priority for the scheduled day, including first thing tomorrow morning.",
        "Do not default to next when now cues are present.",
        "For start and deadline, pick none unless the title clearly implies timing beyond what chrono already extracted.",
        `chronoStart: ${body.parsedStartDate ?? "none"}`,
        `chronoDeadline: ${body.parsedDeadline ?? "none"}`,
        `chronoScheduled: ${body.parsedScheduledDate ?? "none"}`,
      ],
      title: body.titleForSave,
      rawInput: body.rawTitle ?? body.titleForSave,
      today: body.today,
      scheduledDate: body.scheduledDate,
      nowCount: body.nowCount,
      nowSoftCap: DEFAULT_NOW_SOFT_CAP,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
      })),
    },
    questions,
  });

  const projectAnswer = answers.project;
  const bucketAnswer = scheduled ? answers.bucket : undefined;
  const startAnswer = needStart ? answers.start : undefined;
  const deadlineAnswer = needDeadline ? answers.deadline : undefined;

  let projectId: string | null = null;
  let matchedProjectName: string | null = null;

  if (
    projectAnswer.choice !== "none" &&
    projectAnswer.confidence >= QUICK_ADD_PROJECT_CONFIDENCE_MIN
  ) {
    const match = projects.find((project) => project.id === projectAnswer.choice);
    if (match) {
      projectId = match.id;
      matchedProjectName = match.name;
    }
  }

  let bucket: Bucket | null = null;
  if (
    scheduled &&
    bucketAnswer &&
    bucketAnswer.confidence >= QUICK_ADD_BUCKET_CONFIDENCE_MIN
  ) {
    bucket = bucketAnswer.choice as Bucket;
  }

  let startDate: string | null = null;
  if (
    needStart &&
    startAnswer &&
    startAnswer.choice !== "none" &&
    startAnswer.confidence >= QUICK_ADD_START_CONFIDENCE_MIN
  ) {
    startDate = mapStartChoice(
      startAnswer.choice,
      body.today,
      body.scheduledDate,
    );
  }

  let deadline: string | null = null;
  if (
    needDeadline &&
    deadlineAnswer &&
    deadlineAnswer.choice !== "none" &&
    deadlineAnswer.confidence >= QUICK_ADD_DEADLINE_CONFIDENCE_MIN
  ) {
    deadline = mapDeadlineChoice(
      deadlineAnswer.choice,
      body.today,
      body.scheduledDate,
    );
  }

  const accepted = acceptSuggestedDates(startDate, deadline);

  return {
    projectId,
    bucket,
    matchedProjectName,
    startDate: accepted.startDate,
    deadline: accepted.deadline,
    confidence: {
      project: projectAnswer.confidence,
      bucket: bucketAnswer?.confidence ?? null,
      start: startAnswer?.confidence ?? null,
      deadline: deadlineAnswer?.confidence ?? null,
    },
  };
}
