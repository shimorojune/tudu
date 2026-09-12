import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { todayIso, useGetInboxCountQuery, useGetUnscheduledTasksQuery } from "@tudu/store";
import type { RootState } from "@tudu/store";
import { dateLinkSearch } from "@/lib/daySearch";
import { dayTabLabel } from "@/lib/dayLabel";
import { MAIN_NAV_ITEMS } from "@/lib/mainNav";

type TabContentProps = {
  label: string;
  badge?: number;
  count?: number;
};

function TabContent({ label, badge, count }: TabContentProps) {
  const badgeNode =
    badge && badge > 0 ? (
      <span className="bg-primary px-[5px] py-px text-[11px] font-extrabold tabular-nums text-white">
        {badge}
      </span>
    ) : null;

  // Holds two tabular digits so Team never moves as the count crosses 9. Sized
  // against the bold twin below, which is the wider of the two and so sets the
  // column: two bold digits measure 14.42px at 11.5px Archivo. A 3 digit count
  // would still nudge Team.
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
};

function DayTabSlot({ label, to, exact, date }: DayTabSlotProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [width, setWidth] = useState<number>();

  // The label swaps between "Today" and a date, so the tab's natural width
  // changes. Mirroring it onto an explicit width lets CSS animate the resize,
  // which slides the tabs after it instead of snapping them. A ResizeObserver
  // covers every cause of a width change: label swap, active weight, and the
  // webfont landing after first paint.
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
        search={dateLinkSearch(date)}
        activeOptions={exact ? { exact: true } : undefined}
        // shrink-0 keeps the link at its natural width while the slot animates
        // past it, so the measurement above can never feed back on itself.
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
  const { data } = useGetUnscheduledTasksQuery();
  const inboxCountQuery = useGetInboxCountQuery();
  const unscheduledCount = data?.tasks.length ?? 0;
  const inboxCount = inboxCountQuery.data?.count ?? 0;
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const dayLabel = dayTabLabel(selectedDate, todayIso());

  return (
    <nav
      aria-label="Main"
      className="hidden items-center gap-[20px] self-stretch text-[13.5px] xl:flex"
    >
      {MAIN_NAV_ITEMS.map((tab) => {
        const isDayTab = "dayTab" in tab && tab.dayTab;

        if (isDayTab) {
          return (
            <DayTabSlot
              key={tab.to}
              label={dayLabel}
              to={tab.to}
              exact={tab.exact}
              date={selectedDate}
            />
          );
        }

        return (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={tab.exact ? { exact: true } : undefined}
            className="group px-px py-[18px] text-muted-foreground"
            activeProps={{
              className:
                "group is-active px-px py-[18px] text-foreground shadow-[inset_0_-2px_0_var(--foreground)]",
            }}
          >
            <TabContent
              label={tab.label}
              badge={"badge" in tab ? inboxCount : undefined}
              count={"count" in tab ? unscheduledCount : undefined}
            />
          </Link>
        );
      })}
    </nav>
  );
}
