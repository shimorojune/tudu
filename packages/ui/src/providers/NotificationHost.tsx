import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import { viewKey } from "@tudu/shared";
import {
  useGetMeQuery,
  useGetNotificationsQuery,
  useReadNotificationMutation,
  type AppDispatch,
  type RootState,
} from "@tudu/store";
import { readNotificationPrefs } from "@/lib/notificationPrefs";
import {
  bindNotificationNavigate,
  openNotificationTarget,
} from "@/lib/openNotificationTarget";
import { osNotificationFromItem } from "@/lib/notificationDisplay";
import {
  shouldAutoReadNotification,
  shouldFireOsBanner,
} from "@/lib/shouldFireOsBanner";
import { useNotificationOs } from "@/providers/NotificationOsContext";

export function NotificationHost() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const selectedTaskId = useSelector((s: RootState) => s.day.selectedTaskId);
  const inspectorTab = useSelector((s: RootState) => s.day.inspectorTab);
  const syncStatus = useSelector((s: RootState) => s.sync.status);
  const viewStatus = useSelector(
    (s: RootState) => s.sync.views[viewKey.notifications()],
  );
  const { data: me } = useGetMeQuery();
  const { data } = useGetNotificationsQuery();
  const [readOne] = useReadNotificationMutation();
  const os = useNotificationOs();
  const seen = useRef(new Set<string>());
  const seeded = useRef(false);
  const viewerId = me?.id;
  const notifications = data?.notifications ?? [];

  useEffect(() => {
    seen.current = new Set();
    seeded.current = false;
  }, [viewerId]);

  useEffect(() => {
    if (viewStatus !== "ready") {
      return;
    }

    if (!seeded.current) {
      for (const item of notifications) {
        seen.current.add(item.id);
      }
      seeded.current = true;
      return;
    }

    if (syncStatus !== "live") {
      for (const item of notifications) {
        seen.current.add(item.id);
      }
      return;
    }

    const prefs = readNotificationPrefs();
    const focused = document.hasFocus();
    const go = bindNotificationNavigate(navigate);

    for (const item of notifications) {
      if (seen.current.has(item.id)) {
        continue;
      }
      seen.current.add(item.id);
      if (
        shouldAutoReadNotification({
          notification: item,
          windowFocused: focused,
          pathname,
          selectedTaskId,
          inspectorTab,
        })
      ) {
        void readOne(item.id);
        continue;
      }
      if (
        !shouldFireOsBanner({
          notification: item,
          prefs,
          windowFocused: focused,
          pathname,
          selectedTaskId,
        })
      ) {
        continue;
      }
      const osPayload = osNotificationFromItem(item);
      void os.showOsNotification({
        title: osPayload.title,
        body: osPayload.body,
        tag: osPayload.tag,
        onClick: () => {
          if (!viewerId) {
            return;
          }
          openNotificationTarget(item, {
            viewerId,
            dispatch,
            navigate: go,
          });
        },
      });
    }
  }, [
    dispatch,
    inspectorTab,
    navigate,
    notifications,
    os,
    pathname,
    readOne,
    selectedTaskId,
    syncStatus,
    viewStatus,
    viewerId,
  ]);

  return null;
}
