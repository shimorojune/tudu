import { can, type RightsAction } from "./rights.js";
import type { OrgRole } from "./types.js";

export type RightsAudience = "anyone" | "owner" | "nobody" | "owners";

export type RightsReferenceRow = {
  label: string;
  audience: RightsAudience;
};

function audienceForTaskAction(
  action: RightsAction,
  role: OrgRole,
): RightsAudience {
  const ownerCtx = {
    viewerId: "viewer",
    viewerRole: role,
    task: {
      ownerId: "viewer",
      orgId: "org",
      isPrivate: false,
      pendingRequestId: null,
    },
  };
  const otherCtx = {
    viewerId: "viewer",
    viewerRole: role,
    task: {
      ownerId: "other",
      orgId: "org",
      isPrivate: false,
      pendingRequestId: null,
    },
  };
  if (can(action, otherCtx)) {
    return "anyone";
  }
  if (can(action, ownerCtx)) {
    return "owner";
  }
  return "nobody";
}

function audienceForOrgAction(action: RightsAction): RightsAudience {
  if (can(action, { viewerId: "v", viewerRole: "member", task: otherTask() })) {
    return "anyone";
  }
  if (
    can(action, { viewerId: "v", viewerRole: "owner", task: otherTask() })
  ) {
    return "owners";
  }
  return "nobody";
}

function otherTask() {
  return {
    ownerId: "other",
    orgId: "org",
    isPrivate: false,
    pendingRequestId: null,
  };
}

/** Rows for the settings rights reference (5.10), derived from rights.ts. */
export function rightsReferenceRows(orgName: string): RightsReferenceRow[] {
  const memberRole: OrgRole = "member";
  return [
    {
      label: "Read a co-worker's day, week and timelines",
      audience: audienceForTaskAction("read", memberRole),
    },
    {
      label: "Comment on a co-worker's task",
      audience: audienceForTaskAction("comment", memberRole),
    },
    {
      label: "Send a co-worker a new task",
      audience: audienceForTaskAction("sendTask", memberRole),
    },
    {
      label: "Invite someone to the organization",
      audience: audienceForOrgAction("invite") === "anyone" ? "anyone" : "owners",
    },
    {
      label: "Reorder my buckets",
      audience: audienceForTaskAction("editDirect", memberRole),
    },
    {
      label: "Retitle my task, or edit its detail",
      audience: audienceForTaskAction("editDirect", memberRole),
    },
    {
      label: "Set or change a deadline on my task",
      audience: audienceForTaskAction("editDirect", memberRole),
    },
    {
      label: "Complete or reopen my task",
      audience: audienceForTaskAction("editDirect", memberRole),
    },
    {
      label: "Link a JIRA issue to my task",
      audience: audienceForTaskAction("editDirect", memberRole),
    },
    {
      label: "Put anything into my day without asking",
      audience: "nobody",
    },
    {
      label: "See a task I marked private",
      audience: "nobody",
    },
    {
      label: `Move my task out of ${orgName}`,
      audience: "nobody",
    },
    {
      label: "Assign who manages me",
      audience: "nobody",
    },
  ];
}

export function rightsAudienceLabel(audience: RightsAudience): string {
  switch (audience) {
    case "anyone":
      return "Anyone";
    case "owner":
      return "Manager";
    case "owners":
      return "Owners";
    case "nobody":
      return "Nobody";
    default:
      return audience;
  }
}
