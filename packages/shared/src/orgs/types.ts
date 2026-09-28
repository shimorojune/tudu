export type OrgRole = "owner" | "member";

export type TaskRequestKind = "new_task" | "reassign" | "edit";

export type TaskRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "outdated"
  | "returned_resolved";
