import { Bell } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDispatch } from "react-redux";
import { SPACE_COLOR_HEX, type SpaceColor } from "@tudu/shared";
import {
  useGetMeQuery,
  useGetNotificationsQuery,
  useListSpacesQuery,
  useReadAllNotificationsMutation,
  useReadNotificationMutation,
  type AppDispatch,
} from "@tudu/store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { resolveNotificationPresentation } from "@/lib/notificationDisplay";
import {
  bindNotificationNavigate,
  openNotificationTarget,
} from "@/lib/openNotificationTarget";

export function NotificationBell() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { data: me } = useGetMeQuery();
  const { data: spacesData } = useListSpacesQuery();
  const { data } = useGetNotificationsQuery();
  const [readOne] = useReadNotificationMutation();
  const [readAll] = useReadAllNotificationsMutation();
  const [open, setOpen] = useState(false);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const viewerId = me?.id;
  const orgSpaces = (spacesData?.spaces ?? []).filter(
    (space) => space.kind === "org",
  );
  function orgBadge(orgId: string | null) {
    if (!orgId) {
      return null;
    }
    const space = orgSpaces.find(
      (entry) => entry.kind === "org" && entry.orgId === orgId,
    );
    if (!space || space.kind !== "org") {
      return null;
    }
    const color = space.color
      ? SPACE_COLOR_HEX[space.color as SpaceColor]
      : undefined;
    return { name: space.name, color };
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications ${unreadCount}` : "Notifications"}
          className="relative shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Bell size={17} strokeWidth={1.6} />
          {unreadCount > 0 ? (
            <span className="absolute -right-[7px] -top-[6px] bg-primary px-[4px] py-px text-[9px] font-extrabold tabular-nums text-primary-foreground">
              {unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-hair px-[14px] py-[10px]">
          <span className="text-[13px] font-semibold">Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                void readAll();
              }}
            >
              Mark all as read
            </button>
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <p className="px-[14px] py-[28px] text-center text-[13px] text-faint">
            No notifications yet.
          </p>
        ) : (
          <ul className="max-h-[360px] overflow-y-auto">
            {notifications.map((item) => {
              const unread = item.readAt === null;
              const presentation = resolveNotificationPresentation(item);
              const badge = orgBadge(item.orgId);
              return (
                <li key={item.id} className="border-b border-hair last:border-b-0">
                  <button
                    type="button"
                    className={cn(
                      "w-full px-[14px] py-[12px] text-left text-[13px] leading-[1.45]",
                      unread
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                    onClick={() => {
                      if (unread) {
                        void readOne(item.id);
                      }
                      if (viewerId) {
                        openNotificationTarget(item, {
                          viewerId,
                          dispatch,
                          navigate: bindNotificationNavigate(navigate),
                        });
                      }
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {badge ? (
                        <span
                          className="shrink-0 px-[5px] py-px text-[9px] font-bold uppercase tracking-[0.06em] text-primary-foreground"
                          style={{ backgroundColor: badge.color }}
                        >
                          {badge.name}
                        </span>
                      ) : null}
                      <div
                        className={cn(
                          "min-w-0 text-[13px]",
                          unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {presentation.title}
                      </div>
                    </div>
                    {presentation.summary ? (
                      <p className="mt-[4px] text-[12px] text-faint">
                        {presentation.summary}
                      </p>
                    ) : null}
                    {presentation.lines.length > 0 ? (
                      <ul className="mt-[6px] list-none space-y-[4px] text-[12px]">
                        {presentation.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
