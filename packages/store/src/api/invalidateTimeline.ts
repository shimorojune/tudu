import type { AppDispatch } from "../store.js";
import { activityApi } from "./activityApi.js";

/** Refetch page 1 for a task timeline. Used after task writes that add timeline rows. */
export async function refetchTimelineFirstPage(
  dispatch: AppDispatch,
  taskId: string,
) {
  const subscription = dispatch(
    activityApi.endpoints.getTimeline.initiate(taskId, {
      forceRefetch: true,
      subscribe: false,
    }),
  );

  try {
    await subscription;
  } finally {
    subscription.unsubscribe();
  }
}

export async function refetchTimelineFirstPages(
  dispatch: AppDispatch,
  taskIds: string[],
) {
  await Promise.all(
    [...new Set(taskIds)].map((taskId) =>
      refetchTimelineFirstPage(dispatch, taskId),
    ),
  );
}
