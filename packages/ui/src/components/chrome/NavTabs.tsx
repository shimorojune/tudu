import { Link } from "@tanstack/react-router";

const tabs = [
  { label: "Today", to: "/", exact: true },
  { label: "Week", to: "/week", exact: false },
  { label: "Inbox", to: "/inbox", exact: false, badge: 2 },
  { label: "Team", to: "/team", exact: false },
] as const;

function TabContent({ label, badge }: { label: string; badge?: number }) {
  const badgeNode =
    badge && badge > 0 ? (
      <span className="bg-primary px-[5px] py-px text-[11px] font-extrabold tabular-nums text-white">
        {badge}
      </span>
    ) : null;

  return (
    <span className="inline-grid">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 flex items-center gap-[6px] font-bold"
      >
        {label}
        {badgeNode}
      </span>
      <span className="col-start-1 row-start-1 flex items-center gap-[6px] group-[.is-active]:font-bold">
        {label}
        {badgeNode}
      </span>
    </span>
  );
}

export function NavTabs() {
  return (
    <nav
      aria-label="Main"
      className="flex items-center gap-[20px] self-stretch text-[13.5px]"
    >
      {tabs.map((tab) => (
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
            badge={"badge" in tab ? tab.badge : undefined}
          />
        </Link>
      ))}
    </nav>
  );
}
