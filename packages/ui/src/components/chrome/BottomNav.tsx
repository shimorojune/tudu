import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  Inbox,
  LayoutList,
  Users,
} from "lucide-react";
import { useSelector } from "react-redux";
import {
  todayIso,
  useGetInboxCountQuery,
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { dateLinkSearch } from "@/lib/daySearch";
import { MAIN_NAV_ITEMS } from "@/lib/mainNav";

const icons = {
  "/": CalendarDays,
  "/week": CalendarRange,
  "/inbox": Inbox,
  "/unscheduled": LayoutList,
  "/team": Users,
} as const;

export function BottomNav() {
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const inboxCountQuery = useGetInboxCountQuery();
  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;
  const inboxCount = inboxCountQuery.data?.count ?? 0;
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      {MAIN_NAV_ITEMS.map((item) => {
        const Icon = icons[item.to];
        const badge = "badge" in item ? inboxCount : undefined;
        const count = "count" in item ? unscheduledCount : undefined;
        const mark = (badge && badge > 0 ? badge : null) ?? (count && count > 0 ? count : null);

        return (
          <Link
            key={item.to}
            to={item.to}
            search={item.to === "/" ? dateLinkSearch(selectedDate || todayIso()) : undefined}
            activeOptions={
              item.exact ? { exact: true, includeSearch: false } : { includeSearch: false }
            }
            aria-label={item.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-[3px] px-[2px] py-[8px] text-muted-foreground"
            activeProps={{
              className:
                "flex min-w-0 flex-1 flex-col items-center gap-[3px] px-[2px] py-[8px] text-foreground",
            }}
          >
            <span className="relative">
              <Icon size={18} strokeWidth={1.7} aria-hidden />
              {mark ? (
                <span className="absolute -right-[8px] -top-[5px] bg-primary px-[4px] py-px text-[9px] font-extrabold tabular-nums text-primary-foreground">
                  {mark}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate text-[10px] leading-tight">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
