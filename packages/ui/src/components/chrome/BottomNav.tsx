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
  useGetUnscheduledTasksQuery,
  type RootState,
} from "@tudu/store";
import { dateLinkSearch } from "@/lib/daySearch";
import { mainNavItems } from "@/lib/mainNav";
import { useActiveOrgSlug } from "@/hooks/useSpaceContext";

const icons = {
  Today: CalendarDays,
  Week: CalendarRange,
  Requests: Inbox,
  Unscheduled: LayoutList,
  "Co-workers": Users,
} as const;

export function BottomNav() {
  const orgSlug = useActiveOrgSlug();
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const unscheduledCount = unscheduledQuery.data?.tasks.length ?? 0;
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const tabs = mainNavItems(orgSlug);

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      {tabs.map((item) => {
        const Icon = icons[item.label as keyof typeof icons] ?? CalendarDays;
        const count = item.count ? unscheduledCount : undefined;
        const mark = count && count > 0 ? count : null;
        const orgParams =
          orgSlug && item.to.startsWith("/o/") ? { orgSlug } : undefined;

        return (
          <Link
            key={item.to}
            to={item.to}
            params={orgParams}
            search={
              item.dayTab
                ? dateLinkSearch(selectedDate || todayIso())
                : undefined
            }
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
