import type { OrgRole } from "./types.js";

export type RightsAction =
  | "read"
  | "comment"
  | "sendTask"
  | "reassign"
  | "propose"
  | "editDirect"
  | "delete"
  | "moveToSpace"
  | "adminPanel"
  | "invite"
  | "inviteAsOwner"
  | "revokeInvite"
  | "removeMember"
  | "changeRole"
  | "deleteOrg"
  | "toggleJoinLink"
  | "regenerateJoinLink"
  | "approveJoin"
  | "editDomains"
  | "editBadge";

export type RightsContext = {
  viewerId: string;
  viewerRole: OrgRole | null;
  task: {
    ownerId: string;
    orgId: string | null;
    isPrivate: boolean;
    pendingRequestId: string | null;
  };
};

export function can(action: RightsAction, ctx: RightsContext): boolean {
  const isOwner = ctx.task.ownerId === ctx.viewerId;
  const isMember = ctx.viewerRole !== null;
  const isOrgTask = ctx.task.orgId !== null;
  const canSeeTask =
    isOwner ||
    (isMember &&
      isOrgTask &&
      !ctx.task.isPrivate &&
      ctx.task.pendingRequestId === null);

  switch (action) {
    case "read":
      return canSeeTask;
    case "comment":
      return canSeeTask && isOrgTask;
    case "sendTask":
      return isMember;
    case "reassign":
      return isOwner && isOrgTask;
    case "propose":
      return canSeeTask && !isOwner && isOrgTask;
    case "editDirect":
      return isOwner;
    case "delete":
      return isOwner;
    case "moveToSpace":
      return isOwner && ctx.task.orgId === null;
    case "adminPanel":
      return ctx.viewerRole === "owner";
    case "invite":
      return isMember;
    case "inviteAsOwner":
      return ctx.viewerRole === "owner";
    case "revokeInvite":
      return ctx.viewerRole === "owner";
    case "removeMember":
      return ctx.viewerRole === "owner";
    case "changeRole":
      return ctx.viewerRole === "owner";
    case "deleteOrg":
      return ctx.viewerRole === "owner";
    case "toggleJoinLink":
      return ctx.viewerRole === "owner";
    case "regenerateJoinLink":
      return ctx.viewerRole === "owner";
    case "approveJoin":
      return ctx.viewerRole === "owner";
    case "editDomains":
      return ctx.viewerRole === "owner";
    case "editBadge":
      return ctx.viewerRole === "owner";
    default:
      return false;
  }
}
