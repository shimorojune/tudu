import { Link } from "@tanstack/react-router";
import { useGetRequestsQuery, useGetUnscheduledTasksQuery } from "@tudu/store";
import { useRequestsSpace } from "@/hooks/useRequestsSpace";
import { DayTab } from "@/components/chrome/DayTab";
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

export function NavTabs() {
  useLogicalDayClock();
  const orgSlug = useActiveOrgSlug();
  const { data } = useGetUnscheduledTasksQuery();
  const unscheduledCount = data?.tasks.length ?? 0;
  const requestsSpace = useRequestsSpace();
  const { data: requestsData } = useGetRequestsQuery(requestsSpace);
  const incomingRequestCount = requestsData?.incoming.length ?? 0;
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
            <DayTab
              key={tab.to}
              to={tab.to}
              exact={tab.exact}
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
              badge={tab.badge ? incomingRequestCount : undefined}
            />
          </Link>
        );
      })}
    </nav>
  );
}
