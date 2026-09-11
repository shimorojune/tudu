import { useRouterState } from "@tanstack/react-router";

export function useProjectFilterId(): string | undefined {
  return useRouterState({
    select: (state) => {
      const value = (state.location.search as { project?: unknown }).project;
      return typeof value === "string" && value.length > 0 ? value : undefined;
    },
  });
}
