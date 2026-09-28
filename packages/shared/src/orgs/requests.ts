import type { Bucket } from "../tasks.js";
import type { TaskRequestStatus } from "./types.js";

export type ProposalFields = {
  placement?: { scheduledDate: string; bucket: Bucket; index?: number };
  title?: string;
  description?: string | null;
  deadline?: string | null;
  completed?: boolean;
  jiraIssueKey?: string | null;
};

export type TaskSnapshotForStale = {
  scheduledDate: string | null;
  bucket: Bucket | null;
  title: string;
  description: string | null;
  deadline: string | null;
  completedAt: string | null;
  isPrivate: boolean;
};

export const PROPOSAL_FIELD_KEYS = [
  "placement",
  "title",
  "description",
  "deadline",
  "completed",
  "jiraIssueKey",
] as const;

export type ProposalFieldKey = (typeof PROPOSAL_FIELD_KEYS)[number];

export function proposalFields(proposal: ProposalFields): ProposalFieldKey[] {
  return PROPOSAL_FIELD_KEYS.filter((key) => proposal[key] !== undefined);
}

export function isFieldStale(
  field: ProposalFieldKey,
  baseline: TaskSnapshotForStale,
  current: TaskSnapshotForStale,
): boolean {
  if (current.completedAt !== baseline.completedAt) {
    return true;
  }
  if (current.isPrivate && !baseline.isPrivate) {
    return true;
  }
  switch (field) {
    case "placement":
      return (
        current.scheduledDate !== baseline.scheduledDate ||
        current.bucket !== baseline.bucket
      );
    case "title":
      return current.title !== baseline.title;
    case "description":
      return current.description !== baseline.description;
    case "deadline":
      return current.deadline !== baseline.deadline;
    case "completed":
      return (current.completedAt !== null) !== (baseline.completedAt !== null);
    case "jiraIssueKey":
      return false;
    default:
      return false;
  }
}

export type RequestEvent =
  | "accept"
  | "decline"
  | "withdraw"
  | "outdate"
  | "return_resolve";

const VALID: Record<TaskRequestStatus, RequestEvent[]> = {
  pending: ["accept", "decline", "withdraw", "outdate"],
  accepted: [],
  declined: ["return_resolve"],
  withdrawn: [],
  outdated: [],
  returned_resolved: [],
};

export function nextStatus(
  current: TaskRequestStatus,
  event: RequestEvent,
): TaskRequestStatus {
  if (!VALID[current].includes(event)) {
    throw new Error(`Invalid transition: ${current} + ${event}`);
  }
  switch (event) {
    case "accept":
      return "accepted";
    case "decline":
      return "declined";
    case "withdraw":
      return "withdrawn";
    case "outdate":
      return "outdated";
    case "return_resolve":
      return "returned_resolved";
    default:
      throw new Error(`Unknown event: ${event}`);
  }
}

export function voidedFieldsOnAccept(
  acceptedField: ProposalFieldKey,
): ProposalFieldKey[] {
  if (acceptedField === "placement") {
    return ["placement"];
  }
  return [acceptedField];
}

export function clampPlacementIndex(index: number, laneSize: number): number {
  if (laneSize <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= laneSize) {
    return laneSize - 1;
  }
  return index;
}

export type ApplyAcceptTaskPatch = {
  title?: string;
  description?: string | null;
  scheduledDate?: string | null;
  bucket?: Bucket | null;
  position?: number;
  deadline?: string | null;
  completedAt?: string | null;
};

export type ApplyAcceptResult = {
  taskPatch: ApplyAcceptTaskPatch;
  voidFields: ProposalFieldKey[];
};

export function applyAccept(
  proposal: ProposalFields,
  acceptedFields: ProposalFieldKey[],
): ApplyAcceptResult {
  const taskPatch: ApplyAcceptTaskPatch = {};
  const voidFields: ProposalFieldKey[] = [];

  for (const field of acceptedFields) {
    voidFields.push(...voidedFieldsOnAccept(field));
    switch (field) {
      case "placement": {
        const placement = proposal.placement;
        if (placement) {
          taskPatch.scheduledDate = placement.scheduledDate;
          taskPatch.bucket = placement.bucket;
        }
        break;
      }
      case "title":
        if (proposal.title !== undefined) {
          taskPatch.title = proposal.title;
        }
        break;
      case "description":
        if (proposal.description !== undefined) {
          taskPatch.description = proposal.description;
        }
        break;
      case "deadline":
        if (proposal.deadline !== undefined) {
          taskPatch.deadline = proposal.deadline;
        }
        break;
      case "completed":
        if (proposal.completed !== undefined) {
          taskPatch.completedAt = proposal.completed ? new Date().toISOString() : null;
        }
        break;
      case "jiraIssueKey":
        break;
      default:
        break;
    }
  }

  return {
    taskPatch,
    voidFields: [...new Set(voidFields)],
  };
}
