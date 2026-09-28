import { useSelector } from "react-redux";
import type { ProjectSpaceFilter } from "@tudu/shared";
import type { RootState } from "@tudu/store";

export function useProjectSpaceScope(
  override?: ProjectSpaceFilter,
): ProjectSpaceFilter {
  const current = useSelector((state: RootState) => state.space.current);
  if (override) {
    return override;
  }
  if (current.kind === "org") {
    return { kind: "org", orgId: current.orgId };
  }
  return { kind: "personal" };
}
