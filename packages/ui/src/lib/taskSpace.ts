import type { ProjectSpaceFilter } from "@tudu/shared";
import type { CurrentSpace } from "@tudu/store";

export function orgIdForSpace(space: CurrentSpace): string | null {
  return space.kind === "org" ? space.orgId : null;
}

export function projectSpaceFilterFromCurrent(
  space: CurrentSpace,
): ProjectSpaceFilter {
  if (space.kind === "org") {
    return { kind: "org", orgId: space.orgId };
  }
  return { kind: "personal" };
}
