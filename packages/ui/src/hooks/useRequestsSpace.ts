import { useMemo } from "react";
import { PERSONAL_REQUESTS_SPACE } from "@tudu/shared";
import { useListSpacesQuery } from "@tudu/store";
import { useActiveOrgSlug } from "@/hooks/useSpaceContext";

export function useRequestsSpace(): string {
  const orgSlug = useActiveOrgSlug();
  const { data: spacesData } = useListSpacesQuery();
  return useMemo(() => {
    if (!orgSlug) {
      return PERSONAL_REQUESTS_SPACE;
    }
    const match = spacesData?.spaces.find(
      (row) => row.kind === "org" && row.slug === orgSlug,
    );
    return match?.orgId ?? PERSONAL_REQUESTS_SPACE;
  }, [orgSlug, spacesData?.spaces]);
}
