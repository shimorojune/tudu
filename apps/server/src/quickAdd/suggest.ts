import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Db, ProjectRow } from "@tudu/db";
import { listProjectsForUser } from "@tudu/db";
import {
  DEFAULT_NOW_SOFT_CAP,
  QUICK_ADD_BUCKET_CONFIDENCE_MIN,
  QUICK_ADD_PROJECT_CONFIDENCE_MIN,
  type Bucket,
  type QuickAddSuggestRequest,
  type QuickAddSuggestResponse,
} from "@tudu/shared";

export type QuickAddSuggestDeps = {
  db: Db;
  client: TypeSafeClient | null;
};

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

export async function runQuickAddSuggest(
  deps: QuickAddSuggestDeps,
  userId: string,
  body: QuickAddSuggestRequest,
): Promise<QuickAddSuggestResponse> {
  const empty: QuickAddSuggestResponse = {
    projectId: null,
    bucket: null,
    matchedProjectName: null,
    confidence: null,
  };

  if (!deps.client) {
    return empty;
  }

  const projects = await listProjectsForUser(deps.db, userId);
  const scheduled = body.scheduledDate !== null;

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

  const { answers } = await deps.client.systemOne({
    state: {
      task: "Classify Quick Add defaults for project and bucket.",
      rules: [
        "Always choose the single best project and bucket labels.",
        "Bucket now means highest priority for the scheduled day, including first thing tomorrow morning.",
        "Do not default to next when now cues are present.",
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

  return {
    projectId,
    bucket,
    matchedProjectName,
    confidence: {
      project: projectAnswer.confidence,
      bucket: bucketAnswer?.confidence ?? null,
    },
  };
}
