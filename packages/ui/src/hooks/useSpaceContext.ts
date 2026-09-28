import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import {
  setCurrentSpace,
  useListSpacesQuery,
  type RootState,
} from "@tudu/store";
import {
  isPersonalSpacePath,
  isSpaceNeutralPath,
  parseOrgSlugFromPath,
} from "@/lib/spaceNav";

export function useSpaceContext() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const orgSlug = parseOrgSlugFromPath(pathname);
  const dispatch = useDispatch();
  const { data } = useListSpacesQuery();

  useEffect(() => {
    if (orgSlug) {
      const match = data?.spaces.find(
        (space) => space.kind === "org" && space.slug === orgSlug,
      );
      if (match?.orgId && match.slug) {
        dispatch(
          setCurrentSpace({
            kind: "org",
            orgId: match.orgId,
            slug: match.slug,
          }),
        );
      }
      return;
    }
    if (isPersonalSpacePath(pathname)) {
      dispatch(setCurrentSpace({ kind: "personal" }));
    }
  }, [dispatch, orgSlug, pathname, data?.spaces]);
}

export function useActiveOrgSlug(): string | null {
  return useEffectiveOrgSlug();
}

/** Org slug for chrome: URL on org routes, else persisted space on neutral routes. */
export function useEffectiveOrgSlug(): string | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathSlug = parseOrgSlugFromPath(pathname);
  const current = useSelector((state: RootState) => state.space.current);

  if (pathSlug) {
    return pathSlug;
  }
  if (isSpaceNeutralPath(pathname) && current.kind === "org") {
    return current.slug;
  }
  if (isPersonalSpacePath(pathname)) {
    return null;
  }
  return null;
}
