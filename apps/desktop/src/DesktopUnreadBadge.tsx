import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGetMeQuery, useGetNotificationsQuery } from "@tudu/store";

export function DesktopUnreadBadge() {
  const { data: me } = useGetMeQuery();
  const { data } = useGetNotificationsQuery(undefined, {
    skip: !me?.id,
  });
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!me?.id) {
      void invoke("set_unread_badge_command", { count: 0 });
      return;
    }
    void invoke("set_unread_badge_command", { count: unreadCount });
  }, [me?.id, unreadCount]);

  return null;
}
