import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { effectiveDayIso } from "@tudu/shared";
import { useGetUnscheduledTasksQuery } from "@tudu/store";
import type { RootState } from "@tudu/store";
import { dateLinkSearch } from "@/lib/daySearch";
import { dayTabLabel } from "@/lib/dayLabel";
import { mainNavItems } from "@/lib/mainNav";
import { useActiveOrgSlug } from "@/hooks/useSpaceContext";
import { useLogicalDayClock } from "@/hooks/useLogicalDayClock";

type TabContentProps = {
  label: string;
  badge?: number;
  count?: number;
};

function TabContent({ label, badge, count }: TabContentProps) {
  const badgeNode =
    badge && badge > 0 ? (
      <span className="bg-primary px-[5px] py-px text-[11px] font-extrabold tabular-nums text-primary-foreground">
        {badge}
      </span>
    ) : null;

  const countNode =
    count !== undefined ? (
      <span className="min-w-[15px] text-[11.5px] tabular-nums text-faint">{count}</span>
    ) : null;

  const trailing = badgeNode ?? countNode;

  return (
    <span className="inline-grid">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 flex items-center gap-[6px] font-bold"
      >
        {label}
        {trailing}
      </span>
      <span className="col-start-1 row-start-1 flex items-center gap-[6px] group-[.is-active]:font-bold">
        {label}
        {trailing}
      </span>
    </span>
  );
}

type DayTabSlotProps = {
  label: string;
  to: string;
  exact: boolean;
  date: string;
  orgSlug?: string;
};

function DayTabSlot({ label, to, exact, date, orgSlug }: DayTabSlotProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const link = linkRef.current;
    if (!link) return;

    const sync = () => setWidth(link.getBoundingClientRect().width);
    sync();

    const observer = new ResizeObserver(sync);
    observer.observe(link);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      className="inline-flex overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none"
      style={{ width }}
    >
      <Link
        ref={linkRef}
        to={to}
        params={orgSlug ? { orgSlug } : undefined}
        search={dateLinkSearch(date)}
        activeOptions={exact ? { exact: true, includeSearch: false } : { includeSearch: false }}
        className="group shrink-0 px-px py-[18px] text-muted-foreground"
        activeProps={{
          className:
            "group is-active shrink-0 px-px py-[18px] text-foreground shadow-[inset_0_-2px_0_var(--foreground)]",
        }}
      >
        <TabContent label={label} />
      </Link>
    </span>
  );
}

export function NavTabs() {
  useLogicalDayClock();
  const orgSlug = useActiveOrgSlug();
  const { data } = useGetUnscheduledTasksQuery();
  const unscheduledCount = data?.tasks.length ?? 0;
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const dayLabel = dayTabLabel(selectedDate, effectiveDayIso());
  const tabs = mainNavItems(orgSlug);

  return (
    <nav
      aria-label="Main"
      className="hidden items-center gap-[20px] self-stretch text-[13.5px] xl:flex"
    >
      {tabs.map((tab) => {
        const isDayTab = Boolean(tab.dayTab);
        const orgParams =
          orgSlug && tab.to.startsWith("/o/") ? { orgSlug } : undefined;

        if (isDayTab) {
          return (
            <DayTabSlot
              key={tab.to}
              label={dayLabel}
              to={tab.to}
              exact={tab.exact}
              date={selectedDate}
              orgSlug={orgParams?.orgSlug}
            />
          );
        }

        return (
          <Link
            key={tab.to}
            to={tab.to}
            params={orgParams}
            activeOptions={
              tab.exact ? { exact: true, includeSearch: false } : { includeSearch: false }
            }
            className="group px-px py-[18px] text-muted-foreground"
            activeProps={{
              className:
                "group is-active px-px py-[18px] text-foreground shadow-[inset_0_-2px_0_var(--foreground)]",
            }}
          >
            <TabContent
              label={tab.label}
              count={tab.count ? unscheduledCount : undefined}
              badge={tab.badge ? 0 : undefined}
            />
          </Link>
        );
      })}
    </nav>
  );
}
